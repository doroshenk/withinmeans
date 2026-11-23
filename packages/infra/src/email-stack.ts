import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import {
  DkimIdentity,
  EasyDkimSigningKeyLength,
  EmailIdentity,
  Identity,
} from 'aws-cdk-lib/aws-ses';
import type { Construct } from 'constructs';

/** The sending domain (ADR 0008): the subdomain only, so Gmail on doroshenk.com is untouched. */
export const MAIL_DOMAIN = 'within.doroshenk.com';

/**
 * Email for partner invites (P1-03). SES (Simple Email Service) is AWS's email-sending service.
 * Console: SES → Configuration → Identities → within.doroshenk.com. The identity proves we own
 * the domain; DKIM (a signature on every message) is switched on by three CNAME records that you
 * copy by hand into Network Solutions (the stack outputs list them). Until the account leaves the
 * SES sandbox, mail can only go to addresses verified under Identities (verify both partners').
 *
 * One stack for both stages: the identity belongs to the account, and dev and prod send from the
 * same no-reply address. Nothing here receives mail.
 */
export class EmailStack extends Stack {
  readonly identity: EmailIdentity;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.identity = new EmailIdentity(this, 'DomainIdentity', {
      identity: Identity.domain(MAIL_DOMAIN),
      dkimSigning: true,
      dkimIdentity: DkimIdentity.easyDkim(EasyDkimSigningKeyLength.RSA_2048_BIT),
    });

    // The three CNAMEs for Network Solutions: host = DkimNameN without ".doroshenk.com" if the
    // form appends it, value = DkimValueN.
    const records = [
      [this.identity.dkimDnsTokenName1, this.identity.dkimDnsTokenValue1],
      [this.identity.dkimDnsTokenName2, this.identity.dkimDnsTokenValue2],
      [this.identity.dkimDnsTokenName3, this.identity.dkimDnsTokenValue3],
    ] as const;
    records.forEach(([name, value], i) => {
      new CfnOutput(this, `DkimName${String(i + 1)}`, { value: name });
      new CfnOutput(this, `DkimValue${String(i + 1)}`, { value });
    });
  }
}
