# MCPShield Pricing

## Pilot Phase Pricing

MCPShield is launching with simple, transparent pricing designed for teams building with MCP.

### Community Edition — **Free Forever**

Perfect for open source projects and individual developers.

**What's included:**
- ✅ Unlimited local scanning
- ✅ Basic lockfile management (`mcp.lock.json`)
- ✅ CLI commands: `init`, `add`, `verify`, `scan`
- ✅ Typosquat detection
- ✅ Code pattern analysis (eval, exec, network calls)
- ✅ npm and PyPI artifact verification
- ✅ Community support (GitHub Discussions)
- ✅ Self-hosted security scanning

**Limitations:**
- Local-only (no cloud features)
- No reputation database access
- No deep scanning pipeline
- Community support only

---

### Pilot Pro — **$29/repo/month**

For production teams who need deeper security and support.

**Everything in Community, plus:**
- ✅ **Cloud-enhanced scanning** — Deep analysis pipeline with ML-based detection
- ✅ **Reputation database** — Community-verified server scores and reports
- ✅ **Vulnerability tracking** — OSV integration with real-time CVE alerts
- ✅ **SARIF output** — GitHub Code Scanning integration
- ✅ **CI/CD workflows** — Pre-built GitHub Actions & GitLab CI templates
- ✅ **Policy enforcement** — Advanced YAML policies with custom rules
- ✅ **Priority support** — Email support with 48h response time
- ✅ **Early access** — Beta features and roadmap input

**Pricing:**
- **$29 per repository per month** (billed monthly)
- **$25 per repo/month** (annual billing, save 14%)
- Volume discounts available for 10+ repositories

**Example costs:**
- 1 repo: $29/month
- 5 repos: $145/month
- 10 repos: $250/month (volume discount)
- 25+ repos: Contact us for enterprise pricing

---

### Enterprise — **Custom Pricing**

For organizations with advanced compliance and security needs.

**Everything in Pilot Pro, plus:**
- ✅ **On-premise deployment** — Run MCPShield cloud backend in your infrastructure
- ✅ **SSO/SAML integration** — Centralized authentication
- ✅ **Advanced audit logging** — Compliance-ready logs and reports
- ✅ **Custom policies** — Tailored security rules for your organization
- ✅ **Runtime guard** — MCP proxy with real-time policy enforcement
- ✅ **SLA guarantees** — 99.9% uptime commitment
- ✅ **Dedicated support** — Slack/Discord channel with <4h response
- ✅ **Professional services** — Security consulting and integration assistance

**Contact us:** support@mcpshield.dev

---

## Pilot Phase Details

### What "Pilot" Means

This is the **early access phase** as we build out cloud features. Expect:

- **Evolving features** — We're actively developing Pro features based on feedback
- **Generous limits** — No hard caps on scans, API calls, or storage during pilot
- **Pricing lock** — Early adopters get current pricing for 12 months
- **Migration path** — Easy upgrade/downgrade between tiers
- **Cancel anytime** — No contracts, cancel with 30 days notice

### Roadmap to General Availability

We're targeting **Q2 2026** for GA launch. The pilot phase will:

1. **Validate core Pro features** (Q1 2026)
   - Cloud scanning pipeline
   - Reputation database MVP
   - CI/CD integrations

2. **Expand and stabilize** (Q2 2026)
   - Runtime guard beta
   - Advanced policy engine
   - SSO/Enterprise features

3. **Launch GA** (Mid Q2 2026)
   - Finalize pricing
   - Full SLA guarantees
   - Enterprise-ready compliance

---

## Payment & Billing

### Accepted Payment Methods
- Credit card (Visa, Mastercard, Amex)
- ACH (US only, Enterprise tier)
- Invoice (Enterprise tier, annual contracts)

### Billing Cycle
- Monthly plans: Billed on signup date each month
- Annual plans: Billed upfront with 14% discount
- Repository count calculated on the 1st of each month

### Fair Use Policy
During the pilot phase, we don't enforce hard limits. We ask that you:
- Use scanning for legitimate security purposes
- Don't abuse API access or deliberately flood systems
- Report bugs and provide feedback

If we detect abuse, we'll reach out before taking action.

---

## Frequently Asked Questions

### What counts as a "repository"?

A repository is a unique codebase where you run `mcp-shield init`. If you have a monorepo with multiple projects, that's **one repository**. If you have 5 separate Git repos, that's **five repositories**.

### Can I mix Free and Pro repos?

Yes! You can use Community Edition for some projects and Pilot Pro for others. You only pay for Pro-enabled repositories.

### What happens if I exceed my repo count?

We'll send you a friendly email. You can either upgrade your plan or disable Pro features on some repos. No surprise charges.

### Do I need to pay for CI/CD runners?

No. The `$29/repo/month` covers all scanning, whether it's on your laptop, in CI, or from multiple developers. Run it as much as you need.

### What if I'm not satisfied?

We offer a **30-day money-back guarantee**. If you're not happy with Pilot Pro in the first month, email us and we'll refund you, no questions asked.

### Is there a student/OSS discount?

**Yes!** Open source projects and students get **50% off Pilot Pro**. Email support@mcpshield.dev with proof (GitHub link, student ID) to request a discount code.

### When will runtime guard be available?

Runtime guard (MCP proxy with policy enforcement) is planned for **Q2 2026**. It will be included in Pilot Pro at no extra cost during the pilot phase.

---

## Get Started

### Community Edition
```bash
npx mcp-shield init
npx mcp-shield add <server-name>
```

### Pilot Pro
1. Sign up at **mcpshield.dev/pilot** (coming soon)
2. Connect your repositories
3. Get your API key
4. Configure CI/CD workflows

Questions? Email **support@mcpshield.dev**

---

**Last updated:** 2026-02-05  
**Pricing subject to change** — Pilot customers locked in for 12 months from signup
