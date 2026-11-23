import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { describe, expect, it } from 'vitest';
import { createCognitoIdentityProvider } from './identityProvider.js';

function providerWith(send: (command: unknown) => Promise<unknown>) {
  return createCognitoIdentityProvider({ userPoolId: 'pool-1', client: { send: send as never } });
}

function recording(respond: (command: unknown) => unknown) {
  const sent: unknown[] = [];
  const provider = providerWith((command) => {
    sent.push(command);
    return Promise.resolve(respond(command));
  });
  return { provider, sent };
}

describe('P1-02: Cognito identity provider', () => {
  it('P1-02: creates a confirmed login with a permanent password and returns its sub', async () => {
    const { provider, sent } = recording((c) =>
      c instanceof AdminCreateUserCommand
        ? { User: { Attributes: [{ Name: 'sub', Value: 'abc-123' }] } }
        : {},
    );

    expect(await provider.createLogin('sam@example.test', 'abcd1234')).toEqual({ sub: 'abc-123' });

    const create = sent[0] as AdminCreateUserCommand;
    expect(create).toBeInstanceOf(AdminCreateUserCommand);
    expect(create.input).toMatchObject({
      UserPoolId: 'pool-1',
      Username: 'sam@example.test',
      MessageAction: 'SUPPRESS',
    });
    expect(create.input.UserAttributes).toContainEqual({ Name: 'email_verified', Value: 'true' });
    const setPw = sent[1] as AdminSetUserPasswordCommand;
    expect(setPw).toBeInstanceOf(AdminSetUserPasswordCommand);
    expect(setPw.input).toMatchObject({
      UserPoolId: 'pool-1',
      Username: 'sam@example.test',
      Password: 'abcd1234',
      Permanent: true,
    });
  });

  it('P1-02: an existing email resolves "exists" instead of throwing', async () => {
    const provider = providerWith(() =>
      Promise.reject(new UsernameExistsException({ message: 'exists', $metadata: {} })),
    );
    expect(await provider.createLogin('sam@example.test', 'abcd1234')).toBe('exists');
  });

  it('P1-02: other errors are not swallowed', async () => {
    const provider = providerWith(() => Promise.reject(new Error('boom')));
    await expect(provider.createLogin('a@b.test', 'abcd1234')).rejects.toThrow('boom');
  });

  it('P1-02: a created user with no sub is an error, and the half-made login is removed', async () => {
    const { provider, sent } = recording(() => ({ User: { Attributes: [] } }));
    await expect(provider.createLogin('a@b.test', 'abcd1234')).rejects.toThrow(/sub/);
    expect(sent.some((c) => c instanceof AdminDeleteUserCommand)).toBe(true);
  });

  it('P1-02: a rejected password removes the half-made login too', async () => {
    const sent: unknown[] = [];
    const provider = providerWith((command) => {
      sent.push(command);
      if (command instanceof AdminSetUserPasswordCommand) return Promise.reject(new Error('weak'));
      return Promise.resolve({ User: { Attributes: [{ Name: 'sub', Value: 's' }] } });
    });
    await expect(provider.createLogin('a@b.test', 'abcd1234')).rejects.toThrow('weak');
    expect(sent.some((c) => c instanceof AdminDeleteUserCommand)).toBe(true);
  });

  it('P1-02: deleteLogin removes the user', async () => {
    const { provider, sent } = recording(() => ({}));
    await provider.deleteLogin('sam@example.test');
    const del = sent[0] as AdminDeleteUserCommand;
    expect(del).toBeInstanceOf(AdminDeleteUserCommand);
    expect(del.input).toMatchObject({ UserPoolId: 'pool-1', Username: 'sam@example.test' });
  });
});
