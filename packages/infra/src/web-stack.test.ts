import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import type { Stage } from './data-stack.js';
import { domainForStage } from './domains.js';
import { WebStack } from './web-stack.js';

const CERT_ARN =
  'arn:aws:acm:us-east-1:111111111111:certificate/11111111-2222-3333-4444-555555555555';
const MANAGED_CACHING_DISABLED = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad';

function synth(stage: Stage): Template {
  const app = new App();
  const stack = new WebStack(app, `WebStack-${stage}`, {
    stage,
    certificateArn: CERT_ARN,
    apiUrl: 'https://abc123.execute-api.us-east-2.amazonaws.com',
    env: { account: '111111111111', region: 'us-east-2' },
  });
  return Template.fromStack(stack);
}

interface Distribution {
  Properties: {
    DistributionConfig: {
      Aliases: string[];
      ViewerCertificate: { AcmCertificateArn: string };
      CustomErrorResponses: { ErrorCode: number; ResponseCode: number; ResponsePagePath: string }[];
      DefaultCacheBehavior: { ViewerProtocolPolicy: string };
      CacheBehaviors: {
        PathPattern: string;
        CachePolicyId: unknown;
        AllowedMethods: string[];
        TargetOriginId: string;
      }[];
      Origins: { Id: string; DomainName: unknown; OriginAccessControlId?: unknown }[];
    };
  };
}

function distribution(template: Template): Distribution {
  return Object.values(template.findResources('AWS::CloudFront::Distribution'))[0] as Distribution;
}

describe('P0-10: WebStack', () => {
  it('P0-10: the bucket blocks all public access and is readable only by the distribution', () => {
    const template = synth('dev');
    template.resourceCountIs('AWS::S3::Bucket', 1);
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    const policies = Object.values(template.findResources('AWS::S3::BucketPolicy'));
    expect(policies).toHaveLength(1);
    const statements = (
      policies[0]?.Properties as { PolicyDocument: { Statement: Record<string, unknown>[] } }
    ).PolicyDocument.Statement;
    const allows = statements.filter((s) => s.Effect === 'Allow');
    expect(allows).toHaveLength(1);
    expect(allows[0]).toMatchObject({
      Action: 's3:GetObject',
      Principal: { Service: 'cloudfront.amazonaws.com' },
      Condition: { StringEquals: { 'AWS:SourceArn': Match.anyValue() } },
    });
    // The condition names this stack's distribution, not "any distribution".
    expect(JSON.stringify(allows[0]?.Condition)).toContain('arn:');
  });

  it('P0-10: the bucket uses Origin Access Control, not the legacy identity', () => {
    const template = synth('dev');
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    template.resourceCountIs('AWS::CloudFront::CloudFrontOriginAccessIdentity', 0);
  });

  it('P0-10: the /api/* behavior has caching disabled and forwards Authorization', () => {
    const template = synth('dev');
    const behavior = distribution(template).Properties.DistributionConfig.CacheBehaviors.find(
      (b) => b.PathPattern === '/api/*',
    );
    expect(behavior).toBeDefined();
    expect(behavior?.AllowedMethods).toEqual(
      expect.arrayContaining(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    );
    // Caching disabled: the managed CachingDisabled policy, or a policy with every TTL at 0.
    if (!JSON.stringify(behavior?.CachePolicyId).includes(MANAGED_CACHING_DISABLED)) {
      template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
        CachePolicyConfig: { DefaultTTL: 0, MaxTTL: 0, MinTTL: 0 },
      });
    }
    // Authorization is forwarded through an origin request policy.
    template.hasResourceProperties('AWS::CloudFront::OriginRequestPolicy', {
      OriginRequestPolicyConfig: {
        HeadersConfig: {
          HeaderBehavior: 'whitelist',
          Headers: Match.arrayWith(['Authorization']),
        },
      },
    });
  });

  it('P0-10: /api/* goes to the HTTP API host, everything else to the bucket', () => {
    const config = distribution(synth('dev')).Properties.DistributionConfig;
    expect(config.Origins).toHaveLength(2);
    const api = config.CacheBehaviors.find((b) => b.PathPattern === '/api/*');
    const apiOrigin = config.Origins.find((o) => o.Id === api?.TargetOriginId);
    expect(JSON.stringify(apiOrigin?.DomainName)).toContain('execute-api');
    expect(apiOrigin?.OriginAccessControlId).toBeUndefined();
  });

  it.each(['dev', 'prod'] as const)(
    'P0-10: %s alternate domain matches the stage and uses the certificate',
    (s) => {
      const config = distribution(synth(s)).Properties.DistributionConfig;
      expect(config.Aliases).toEqual([domainForStage(s)]);
      expect(config.ViewerCertificate.AcmCertificateArn).toBe(CERT_ARN);
    },
  );

  it('P0-10: unknown paths fall back to index.html (single-page app)', () => {
    const errors = distribution(synth('dev')).Properties.DistributionConfig.CustomErrorResponses;
    for (const code of [403, 404]) {
      expect(errors).toContainEqual(
        expect.objectContaining({
          ErrorCode: code,
          ResponseCode: 200,
          ResponsePagePath: '/index.html',
        }),
      );
    }
  });

  it('P0-10: viewers are redirected from HTTP to HTTPS', () => {
    expect(
      distribution(synth('dev')).Properties.DistributionConfig.DefaultCacheBehavior
        .ViewerProtocolPolicy,
    ).toBe('redirect-to-https');
  });

  it('P0-10: the stack prints the distribution domain to point the CNAME at', () => {
    const outputs = Object.keys(synth('dev').toJSON().Outputs as object);
    expect(outputs).toContain('DistributionDomain');
    expect(outputs).toContain('SiteDomain');
  });

  it('P0-10: prod keeps its bucket when the stack is removed; dev does not', () => {
    const prod = Object.values(synth('prod').findResources('AWS::S3::Bucket'))[0];
    const dev = Object.values(synth('dev').findResources('AWS::S3::Bucket'))[0];
    expect(prod?.DeletionPolicy).toBe('Retain');
    expect(dev?.DeletionPolicy).toBe('Delete');
  });
});
