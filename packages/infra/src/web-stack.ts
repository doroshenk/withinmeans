import { CfnOutput, Fn, RemovalPolicy, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
  OriginRequestPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { HttpOrigin, S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BlockPublicAccess, Bucket, BucketEncryption, type IBucket } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';
import type { Stage } from './data-stack.js';
import { domainForStage } from './domains.js';

export interface WebStackProps extends StackProps {
  readonly stage: Stage;
  /** ARN of the stage's ACM certificate in us-east-1. */
  readonly certificateArn: string;
  /** The HTTP API's endpoint URL, e.g. https://abc.execute-api.us-east-2.amazonaws.com */
  readonly apiUrl: string;
}

/**
 * The website for one stage: a private S3 bucket holding the built web app, and a CloudFront
 * distribution in front of it. Console: S3 → Buckets (Permissions → Block public access),
 * CloudFront → Distributions (Origins and Behaviors tabs).
 */
export class WebStack extends Stack {
  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';
    const domain = domainForStage(props.stage);

    // The files of the web app. Nothing is public: only CloudFront can read them.
    const bucket = new Bucket(this, 'SiteBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // The API host is the URL without "https://" and any path.
    const apiHost = Fn.select(2, Fn.split('/', props.apiUrl));

    const distribution = new Distribution(this, 'Distribution', {
      domainNames: [domain],
      certificate: Certificate.fromCertificateArn(this, 'Certificate', props.certificateArn),
      defaultRootObject: 'index.html',
      // Origin Access Control: CloudFront signs its requests, and the bucket policy trusts
      // only this distribution.
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket as IBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new HttpOrigin(apiHost),
          viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: AllowedMethods.ALLOW_ALL,
          // API answers are per user: never cache them.
          cachePolicy: CachePolicy.CACHING_DISABLED,
          // Forward every viewer header except Host, which includes the Cognito token in
          // Authorization (CloudFront rejects naming Authorization in a custom policy), and the
          // query string. API Gateway then sees its own host name.
          originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      // Single-page app: unknown paths (S3 answers 403 for a missing key) load the app instead.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
      })),
    });
    Tags.of(this).add('Stage', props.stage);

    // Values for Network Solutions: CNAME <SiteDomain> → <DistributionDomain>.
    new CfnOutput(this, 'SiteDomain', { value: domain });
    new CfnOutput(this, 'DistributionDomain', { value: distribution.distributionDomainName });
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
  }
}
