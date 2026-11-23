import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { AuthStack } from './auth-stack.js';
import type { Stage } from './data-stack.js';

function synth(stage: Stage): Template {
  const stack = new AuthStack(new App(), `AuthStack-${stage}`, {
    stage,
    env: { account: '111111111111', region: 'us-east-2' },
  });
  return Template.fromStack(stack);
}

describe('P0-08: AuthStack', () => {
  it.each(['dev', 'prod'] as const)('P0-08: %s has exactly one pool and one app client', (s) => {
    const template = synth(s);
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
  });

  it('P0-08: user pool is on the Essentials feature plan', () => {
    synth('dev').hasResourceProperties('AWS::Cognito::UserPool', { UserPoolTier: 'ESSENTIALS' });
  });

  it('P0-08: password minimum length is 8, with no character-class rules', () => {
    synth('dev').hasResourceProperties('AWS::Cognito::UserPool', {
      Policies: {
        PasswordPolicy: {
          MinimumLength: 8,
          RequireLowercase: false,
          RequireUppercase: false,
          RequireNumbers: false,
          RequireSymbols: false,
        },
      },
    });
  });

  it('P1-02: the pool is closed to public SignUp (logins are created by our API, so no email enumeration)', () => {
    synth('dev').hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
    });
  });

  it('P0-08: email sign-in is case-insensitive', () => {
    synth('dev').hasResourceProperties('AWS::Cognito::UserPool', {
      UsernameConfiguration: { CaseSensitive: false },
    });
  });

  it('P0-08: sign-in and reset do not reveal whether an email is registered', () => {
    synth('dev').hasResourceProperties('AWS::Cognito::UserPoolClient', {
      PreventUserExistenceErrors: 'ENABLED',
    });
  });

  it('P0-08: email is the username and is auto-verified', () => {
    synth('dev').hasResourceProperties('AWS::Cognito::UserPool', {
      UsernameAttributes: ['email'],
      AutoVerifiedAttributes: ['email'],
    });
  });

  it('P0-08: password reset goes by email', () => {
    synth('dev').hasResourceProperties('AWS::Cognito::UserPool', {
      AccountRecoverySetting: {
        RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }],
      },
    });
  });

  it('P0-08: app client has no secret', () => {
    synth('dev').hasResourceProperties('AWS::Cognito::UserPoolClient', { GenerateSecret: false });
  });

  it('P0-08: app client allows SRP and refresh tokens only', () => {
    synth('dev').hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ExplicitAuthFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
    });
  });

  it('P0-08: refresh tokens last long enough for "keep me signed in"', () => {
    synth('dev').hasResourceProperties('AWS::Cognito::UserPoolClient', {
      RefreshTokenValidity: 43200,
      TokenValidityUnits: Match.objectLike({ RefreshToken: 'minutes' }),
    });
  });

  it('P0-08: prod pool is retained if the stack is deleted', () => {
    synth('prod').hasResource('AWS::Cognito::UserPool', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
    });
  });

  it('P0-08: dev pool can be torn down', () => {
    synth('dev').hasResource('AWS::Cognito::UserPool', { DeletionPolicy: 'Delete' });
  });

  it('P0-08: outputs the pool ID and client ID', () => {
    const outputs = synth('dev').toJSON().Outputs as Record<string, unknown>;
    expect(Object.keys(outputs)).toEqual(
      expect.arrayContaining(['UserPoolId', 'UserPoolClientId']),
    );
  });
});
