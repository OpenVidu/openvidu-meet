## ADDED Requirements

### Requirement: Unusable proxy subnets are reported
Meet SHALL log a warning at startup, naming `SERVER_TRUST_PROXY`, when it holds an IPv4-mapped IPv6 subnet with a prefix shorter than 96 bits, because such a subnet trusts no IPv4 proxy. Meet SHALL still start and pass the value on unchanged.

#### Scenario: Short IPv4-mapped prefix
- **GIVEN** `SERVER_TRUST_PROXY=::ffff:10.0.0.0/8`
- **WHEN** Meet starts
- **THEN** it logs a warning naming `SERVER_TRUST_PROXY` and the subnet
- **AND** it serves requests
