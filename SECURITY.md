# Security Policy

## Supported versions

Security fixes are applied to the latest GitHub Release. Older versions may be asked to upgrade before receiving a fix.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's [private vulnerability reporting form](https://github.com/leonardoxr/dsh-companion/security/advisories/new). Include the affected version, reproduction steps, impact, and any suggested mitigation. You should receive an acknowledgement within seven days.

If private vulnerability reporting is unavailable, contact [@leonardoxr](https://github.com/leonardoxr) using a private contact method listed on the maintainer's profile.

## Security boundary

This plugin exposes workspace and live-session metadata over HTTP. Its trusted-host and same-origin checks reduce DNS-rebinding and cross-site browser risks, but they do not authenticate users. Operators must keep DSH reachable only by trusted clients and networks.

Please report issues involving authority parsing, origin checks, unintended fields in responses, route mutation, or access outside the configured DSH trust boundary.
