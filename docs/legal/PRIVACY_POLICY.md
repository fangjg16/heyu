# 合域 Heyu — Privacy Policy | 隐私政策

**Status:** 文稿草案（未挂到网站 `/privacy`）  
**Entity:** JFO AI, Inc.（合域 AI）  
**Website:** https://heyu.hk  
**Contact:** support@heyu.hk  
**Last updated:** 14 September 2026 / 2026年9月14日  

**对照基准:** Reuben AI Privacy Policy（Last updated: 26 July 2026）。下文「相对 Reuben」标注 **改 / 删 / 加**。  
**Disclaimer:** 本文不是法律意见。上线前须由香港（如服务内地用户，再加内地）律师审阅。

---

## 相对 Reuben：总表

| 类型 | 内容 |
| --- | --- |
| **改** | 主体：Reuben Ventures Pty Ltd / 澳洲 → JFO AI, Inc. / 香港。产品：私募 deal·IC·基金工作流 → 家族办公室投研工作台（资料包、对话、知识网络）。管辖：澳洲 Privacy Act + GDPR 为主 → 香港《个人资料（私隐）条例》为主，内地用户另写《个人信息保护法》，GDPR 仅「如适用」。联系：hello@goreuben.com → support@heyu.hk。存储：Supabase/AWS 澳洲与美国 → 香港运营 + 自建 MySQL/MinIO/ECS。 |
| **删** | LinkedIn、Crunchbase、Perplexity、Google Drive、Zapier、n8n 数据来源。PostHog 与独立 Cookie Policy。付款卡、订阅、税务 7 年账册。基金规模/策略、IC 投票等 Reuben 业务字段。「不把单笔 deal 分享给其他客户」的 VC SaaS 话术（改为项目权限隔离的如实描述）。平台内 Settings 一键导出/删号（合域目前以邮件请求为主）。未证实的 MFA/RLS/定期审计/72 小时查漏洞广告。向 OAIC/ICO 报备的澳洲/英国模板。 |
| **加** | 项目资料包 vs 对话附件；OCR/看图/解析摘要；知识网络草案与发布；用户访谈；Admin/Core/Basic 与成熟项目协作方；处理者 Clerk、阿里云百炼/通义、Tavily、Cloudflare、GitHub Pages；跨境香港 / 中国内地 / 美国；用户上传第三方尽调与证件的责任。 |

---

## English

Welcome to Heyu (合域), an AI-assisted research workspace for family offices. We protect your privacy, secure your data, and explain how the platform works.

This Privacy Policy describes what information we collect, how we use it, who we share it with, and your rights. We handle personal data in accordance with the Personal Data (Privacy) Ordinance (Cap. 486) of the Hong Kong SAR. If you are in Mainland China, the Personal Information Protection Law of the PRC also applies. Other laws (including the GDPR) apply only where they legally bind us.

### 1. Information We Collect

> **相对 Reuben §1：** **改** 账户与组织字段改为合域项目/角色。**删** Fund details、Deal data、Portfolio、IC memos、Payment information；Third-party LinkedIn/Crunchbase/Perplexity/Google Drive/Zapier/n8n；PostHog 式 activity tracking。**加** 资料包与对话附件、OCR/看图/摘要、知识网络、用户访谈、操作日志。

**Information you provide**
- Account details: name, email, password or login credentials, optional profile fields (title, organisation).
- Organisation and project metadata: project name, type (for example early-stage / mature / acquisition), member list and roles (Admin, Core, Basic), collaboration settings where enabled.
- Workspace content you upload or type: files in the project library and in a conversation (business plans, diligence packs, contracts, slides, images, emails, spreadsheets), chat messages, rewrite instructions, interview answers, comments, and open questions.
- Derived workspace records: document parse/OCR/vision extracts, AI summaries, knowledge-network chapter drafts and published versions, version history, and operation logs.

**Information collected automatically**
- Usage: pages and features used, approximate session timing.
- Device: browser type, OS, IP address, and similar identifiers needed for security and diagnostics.
- Logs: API calls, errors, authentication events, and security-related events.
- Cookies: essential cookies for login and session (see Section 12). We do not currently operate a separate advertising or product-analytics cookie suite.

**Information from third parties (only as needed to run the Service)**
- Identity provider (Clerk): account authentication and session.
- We do not pull your data from LinkedIn, Crunchbase, Google Drive, or automation tools unless you later connect such a product and we update this Policy.

We do not require payment card data. We do not knowingly collect data from children under 18.

### 2. How We Use Your Information

> **相对 Reuben §2：** **改** Service Delivery / AI Processing 改为合域功能（解析、对话、知识网络、访谈）。**删** IC memos、deal scores、payment processing、aggregated industry benchmarks with opt-out 产品承诺。**加** 「不用客户文件训练自有模型」；明确 AI 输出不是投资决定。

- Deliver the Service: projects, files, permissions, chat, parsing, knowledge-network drafts and publication, collaboration (where the project type allows it).
- AI processing: generate answers, summaries, OCR/vision text, chapter drafts, and similar assistive outputs from the materials you designate.
- Security and abuse prevention; service communications (login, faults, policy notices); legal compliance.
- Limited product improvement using aggregated or de-identified signals (for example error rates). We do not use your project files to train our own models.

**We do not**
- Sell your personal data.
- Use your data for advertising targeting.
- Share one customer’s project files with another customer.
- Train our own models on your proprietary project files.
- Treat AI output as a final investment decision.

### 3. Legal Basis

> **相对 Reuben §3：** **改** 澳洲 Privacy Act + GDPR 四项法律基础 → 香港 PDPO 为主，个保法/GDPR 如适用。**删** 以「履约处理付款」作为主要基础（当前无平台内收费）。

- Hong Kong PDPO: we collect and use personal data for the purposes stated, by fair means, and only as much as needed for those purposes.
- Contract / requested service: providing the account and workspace you asked for.
- Legitimate interests (where applicable): security, fraud prevention, keeping the Service running.
- Consent: where a law requires it (for example certain Mainland China processing or optional communications).
- Legal obligation: lawful requests, disputes, and mandatory records.

### 4. AI and Automated Processing

> **相对 Reuben §4：** **改** deal scoring / IC memo → 对话、抽字、章节草案。**删** 「可用汇总匿名数据改进自有算法并可 opt-out」的产品化承诺（合域未提供该开关）。**加** OCR/看图会把页面图像发给模型；公开网页检索；用户访谈；第三方训练以供应商合同为准，不写死「第三方永不训练」。

Heyu uses large language models and related tools to read documents, extract text (including OCR and page images), search public web pages when a question requires it, and draft knowledge-network chapters or chat replies.

- Outputs are **assistive**. A human in your organisation must review them before you rely on them. We do not make fully automated investment decisions.
- Accuracy is **not guaranteed**. Models may omit, invent, or outdated information.
- You may ignore or override any output.
- File bytes and prompts may be sent to subprocessors listed in Section 5 **for inference**, not so that we can train a public model on your deals.
- Whether a model vendor may use API data to improve its own systems is governed by that vendor’s terms and our contract with them. We will not grant extra training rights over your files beyond what those contracts already allow, and we will not opt you into optional training programmes without notice.

Early-stage **user interviews** collect answers you (or a designated member) type in an interview thread. Those answers are project business information and may be used to update knowledge-network drafts. They are not a separate consumer survey product.

### 5. Sharing and Sub-processors

> **相对 Reuben §5：** **删** Supabase、LinkedIn、Crunchbase、Perplexity、Payment processors。**改** 处理者清单为合域实际供应商。**加** 角色可见范围、对话附件 vs 资料包、成熟项目协作方。

We share data only with parties needed to operate Heyu, within your organisation as you configure, or as the law requires.

**Sub-processors (current)**
- Clerk — sign-in and session (typically processed in the United States).
- Alibaba Cloud Dashscope / Qwen — chat, summarisation, OCR, and vision (typically processed in Mainland China).
- Tavily — public web search when a query needs live public sources (typically processed in the United States).
- Our hosting: application servers, MySQL, and object storage (MinIO) on our cloud VM; traffic may pass through Cloudflare; the website front-end is served from GitHub Pages.

**Other disclosures**
- Members you invite, at their role: Admin (manage and publish), Core (work in the project), Basic (read-only). On mature projects, collaboration counterparts see only what you grant.
- Conversation-only files stay in that thread’s scope; project-library files follow project permissions.
- With your instruction; to professional advisers under confidentiality; in a merger or asset transfer with notice where practicable; or if required by law.

We do not sell personal data.

### 6. Retention

> **相对 Reuben §6：** **删** 订阅结束后 30 天、财务记录 7 年、无限期行业基准。**改** 为账户存续 + 删除/争议所需期间；日志约 90 天。**加** 目前不收费故无 7 年账册；若开始收费将更新本政策。

- Account and workspace data: for the life of the account, then as long as needed to complete deletion or resolve disputes.
- Backups and security logs: a limited period for recovery and abuse investigation (typically up to 90 days for logs, unless a security or legal matter requires longer).
- We do not keep “billing records for 7 years” because we do not currently charge through the platform. If billing starts, we will update this Policy.

You may request earlier deletion subject to law (for example we may keep a record of the request itself).

### 7. International Transfers

> **相对 Reuben §7：** **改** Primary Storage Australia+US (AWS via Supabase) → 香港运营。**加** 中国内地（百炼）、美国（Clerk、Tavily）。**删** 仅依赖 SCC 面向欧盟的澳洲模板表述；改为「按适用法律采用相应出境机制」。

We are based in Hong Kong. Your data may be stored or processed in Hong Kong, Mainland China, the United States, and other places where our subprocessors operate. Cross-border transfers are made to provide the Service you requested. For Mainland China personal information, we will use the transfer mechanisms required by applicable law.

### 8. Your Rights

> **相对 Reuben §8：** **改** OAIC / hello@goreuben.com / 平台 Settings 导出 → PCPD、support@heyu.hk、邮件请求。**加** 个保法权利（如适用）。**删** 承诺产品内一键 portability（CSV/JSON），因合域尚未提供该开关。

**Hong Kong (PDPO):** request access to and correction of your personal data; complain to the Privacy Commissioner for Personal Data (PCPD), https://www.pcpd.org.hk.

**Mainland China (PIPL), if applicable:** access, correction, deletion, explanation of processing, withdraw consent where processing is consent-based, and other rights the law provides.

**GDPR, if applicable:** access, rectification, erasure, portability, objection, restriction, withdraw consent, and lodge a complaint with a supervisory authority.

**How to ask:** email support@heyu.hk with subject “Data Request”, your name, account email, and what you want. We will verify identity and respond within the time the applicable law requires (and in any event we aim to respond within 30 days).

Role-based tools in the product let Admins remove members or files according to product rules; that is not a substitute for a formal data-subject request where the law requires one.

### 9. Security

> **相对 Reuben §9：** **删** 未证实的 MFA 全员可用、RLS、regular audits、geo-distributed encrypted backups 广告。**改** 为已实施项：HTTPS、角色访问、操作日志；MFA 仅「如登录服务支持则可开启」。

We use HTTPS in transit, access control by project role, and operation logs. Clerk may offer multi-factor authentication; enable it if available. No system is perfectly secure. You must protect your password and devices. Report suspected unauthorised access to support@heyu.hk.

### 10. Breach Notification

> **相对 Reuben §10：** **改** OAIC/ICO、72 小时内部时限的硬承诺 → 按适用法律通知（香港含 PCPD）。不把未对外承诺的内部 SLA 写进对客政策。

If a breach is likely to affect your personal data, we will investigate promptly and notify affected users and authorities as required by applicable law (including, where required, the PCPD in Hong Kong).

### 11. Children

> **相对 Reuben §11：** **改** 联系邮箱。其余（18 岁、B2B）保留。

The Service is for professionals aged 18 or over. We do not knowingly collect data from minors. If we learn an account belongs to someone under 18, we will close it. Contact support@heyu.hk to report underage use.

### 12. Cookies

> **相对 Reuben §12：** **删** PostHog、独立 Cookie Policy、可关闭的 Functional Cookies 产品。**改** 仅必要登录 Cookie（Clerk 与接口）。

- **Essential:** login and session (Clerk and our API). The Service cannot work without them.
- We do not currently use a separate advertising cookie layer. If we add analytics cookies, we will update this section.

### 13. Your Responsibilities

> **相对 Reuben §13：** **改** 强调尽调包、合同、证件影像。**加** 邀请成员即授权其在权限内查阅；对话附件与资料包范围不同。

- Upload only data you have the right to upload (including third-party confidential packages).
- Follow your organisation’s confidentiality rules.
- Avoid unnecessary sensitive personal data (health, government ID images, biometrics) unless the project truly requires it and you have a lawful basis.
- If you enter another person’s data (for example a founder’s contact details), you are responsible for having the right to do so.
- Invite only people who may see that project.

### 14. Changes

> **相对 Reuben §14：** **删** 「重大变更提前 30 天电邮」的硬承诺（合域规模下改为页面更新 + 适当时通知）。**改** 联系与产品名。

Material changes will be posted on this page with a new “Last updated” date and, where appropriate, notice by email or in the product. Continued use after the effective date means you accept the updated Policy. If you do not agree, stop using the Service and request account closure.

### 15. Contact

> **相对 Reuben §15：** **改** 全部联系信息。**删** OAIC 作为主监管（改为 PCPD）。**加** 内地主管部门（如适用）。

JFO AI, Inc. (合域 AI)  
9F China Life Center, 18 Hung Luen Road, Hung Hom, Kowloon, Hong Kong  
Email: support@heyu.hk  
Subject for privacy requests: “Data Request”

Hong Kong authority: PCPD, https://www.pcpd.org.hk  
Mainland China: the CAC or local authorities as applicable.

---

## 中文

欢迎使用合域（Heyu）：面向家族办公室的 AI 辅助投研工作台。我们保护您的私隐，并说明平台如何运作。

本政策说明我们收集哪些资料、如何使用、与谁共享，以及您的权利。我们按照香港《个人资料（私隐）条例》（第 486 章）处理个人资料。若您位于中国内地，《个人信息保护法》同样适用。其他法律（包括 GDPR）仅在依法约束我们时适用。

### 1. 我们收集的信息

> **相对 Reuben §1：** **改** 账户与项目角色。**删** 基金/交易/投委会/付款及 LinkedIn 等第三方源。**加** 资料包、对话附件、OCR/看图、知识网络、访谈、操作日志。

**您提供的信息**
- 账户：姓名、电邮、密码或登录凭证，以及可选的职位、机构名称。
- 组织与项目：项目名称与类型（如早期 / 成熟 / 收购）、成员与角色（管理员 Admin、核心 Core、只读 Basic）、以及项目所允许的协作设置。
- 您上传或输入的内容：项目资料包与对话附件（商业计划书、尽调材料、合同、幻灯片、图片、邮件、表格等）、对话、改写说明、用户访谈回答、待确认问题。
- 由此生成的记录：解析 / OCR / 看图摘录、AI 摘要、知识网络章节草案与已发布版本、版本历史、操作日志。

**自动收集**
- 使用情况、设备与浏览器、IP、诊断与安全日志。
- Cookie：登录与会话所必需（见第 12 条）。我们目前没有独立的广告或产品分析 Cookie 套件。

**来自第三方（仅为运转服务）**
- 登录服务商 Clerk：身份验证与会话。
- 我们不会从 LinkedIn、Crunchbase、Google Drive 或自动化工具拉取您的数据，除非日后接通并更新本政策。

我们不收集支付卡信息。我们不会有意收集 18 岁以下未成年人的资料。

### 2. 我们如何使用

> **相对 Reuben §2：** **改** 用途为合域功能。**删** IC memo、行业基准 opt-out。**加** 不训练自有模型；AI 非投资决定。

- 提供服务：项目、文件、权限、对话、解析、知识网络草案与发布、以及项目类型允许的协作。
- AI 处理：基于您指定的材料生成回答、摘要、OCR/看图文字、章节草案等辅助输出。
- 安全与防滥用；服务通知；守法。
- 用汇总或去标识信息改进稳定性（例如错误率）。我们不用您的项目文件训练我们自己的模型。

**我们不会**
- 出售您的个人资料；
- 用于广告定向；
- 把一家客户的项目文件提供给另一家客户；
- 用您的专有项目文件训练我们自己的模型；
- 把 AI 输出当作最终投资决定。

### 3. 处理基础

> **相对 Reuben §3：** **改** 香港 PDPO 为主。**删** 付款履约为主要基础。

- 香港 PDPO：为所述目的、以公平方式、在必要范围内收集使用。
- 履行您要求的服务（账户与工作区）。
- 在适用时基于正当利益：安全、防欺诈、维持运行。
- 法律要求同意时取得同意。
- 法定义务。

### 4. AI 与自动化

> **相对 Reuben §4：** **改** 合域 AI 场景。**删** 自有算法 opt-out 产品。**加** OCR/看图、公开检索、用户访谈、供应商训练以合同为准。

合域使用大模型及相关工具阅读文件、抽字（含 OCR 与页面图像）、在需要时检索公开网页，并起草知识网络章节或对话回复。

- 输出仅为**辅助**。组织内须由人审阅后才能当作依据。我们不做全自动投资决策。
- **不保证准确**，可能遗漏、编造或过时。
- 您可以忽略或改写任何输出。
- 文件与提示可能发送给第 5 条所列处理者，用途是**推理**，不是让我们拿您的项目去训练公开模型。
- 模型供应商能否用 API 数据改进其系统，以该供应商条款及我们与其的合同为准。我们不会在合同之外再授予训练权，也不会在未通知的情况下给您报名可选训练计划。

早期项目的**用户访谈**收集指定成员在访谈会话中的回答，属于项目业务信息，可用于更新知识网络草案。

### 5. 共享与处理者

> **相对 Reuben §5：** **删** Supabase 等。**改** Clerk、百炼、Tavily、自建托管。**加** 角色与附件范围。

仅在运营合域所必需、您配置的组织范围、或法律要求时共享。

**现处理者**
- Clerk：登录与会话（通常在美国处理）。
- 阿里云百炼 / 通义：对话、摘要、OCR、看图（通常在中国内地处理）。
- Tavily：问题需要公开网页时的检索（通常在美国处理）。
- 自建托管：应用服务器、MySQL、对象存储 MinIO；流量可能经过 Cloudflare；网站前端由 GitHub Pages 提供。

**其他披露**
- 您邀请的成员，按其角色可见；成熟项目的协作方仅见您授予的范围。
- 对话附件限于该对话；项目资料包按项目权限。
- 依您指示、向负有保密义务的专业顾问、并购等业务承继（在可行时事先告知），或依法提供。

我们不出售个人资料。

### 6. 保存期限

> **相对 Reuben §6：** **删** 订阅 +30 天、财务 7 年、无限期基准。**改** 账户存续与日志约 90 天。

- 账户与工作区：账户存续期间，以及删除或争议处理所需的合理期间。
- 备份与安全日志：通常不超过约 90 天，除非安全或法律事项需要更长。
- 目前平台不收费，因此没有「财务记录保存 7 年」；若开始收费，我们会更新本政策。

您可依法请求提前删除。

### 7. 跨境

> **相对 Reuben §7：** **改** 香港 + 内地百炼 + 美国 Clerk/Tavily。

我们位于香港。资料可能在香港、中国内地、美国及处理者所在地处理。跨境是为提供您要求的服务。涉及内地个人信息时，我们将按适用法律采用相应出境机制。

### 8. 您的权利

> **相对 Reuben §8：** **改** PCPD 与 support@heyu.hk。**删** 产品内一键导出承诺。**加** 个保法。

**香港 PDPO：** 查阅、改正；可向个人资料私隐专员公署投诉（https://www.pcpd.org.hk）。

**中国内地个保法（如适用）：** 查阅、更正、删除、解释、在同意处理时撤回同意，以及法律列举的其他权利。

**GDPR（如适用）：** 查阅、更正、删除、可携、反对、限制、撤回同意、向监管机构投诉。

**如何行使：** 电邮 support@heyu.hk，主题「Data Request」或「数据请求」，写明姓名、账户邮箱与具体请求。我们将核实身份，并在法定期限内答复（我们目标为 30 日内）。

产品内管理员移除成员或文件，不能替代法律规定的正式权利请求。

### 9. 安全

> **相对 Reuben §9：** **删** 未证实安全广告。**改** HTTPS、角色、日志。

传输使用 HTTPS，按项目角色控制访问，并保留操作日志。Clerk 若提供多因素认证，请开启。任何系统都不是绝对安全。请保护密码与设备。怀疑盗用请立即联系 support@heyu.hk。

### 10. 泄露通知

> **相对 Reuben §10：** **改** 按适用法律通知，香港含 PCPD。

若泄露可能影响您的个人资料，我们将及时调查，并按适用法律通知受影响用户及主管部门（在香港包括私隐专员公署，如法律要求）。

### 11. 未成年人

> **相对 Reuben §11：** **改** 邮箱。

本服务面向 18 岁或以上专业人士。如发现未满 18 岁账户将予关闭。举报请发 support@heyu.hk。

### 12. Cookie

> **相对 Reuben §12：** **删** PostHog 与独立 Cookie 页。**改** 仅必要登录 Cookie。

- **必要：** 登录与会话（Clerk 及我们的接口）。没有这些服务无法使用。
- 目前没有单独的广告 Cookie。若增加分析 Cookie，我们会更新本节。

### 13. 您的责任

> **相对 Reuben §13：** **加** 尽调/证件、邀请即授权。

- 仅上传您有权上传的资料（包括第三方保密材料包）。
- 遵守所属机构的保密规定。
- 除非项目确有必要且有合法基础，避免上传健康信息、证件影像、生物识别等敏感个人资料。
- 录入他人资料（如创始人联系方式）时，由您确保有权录入。
- 只邀请有权查看该项目的人。

### 14. 变更

> **相对 Reuben §14：** **删** 固定 30 天电邮预告。

重大变更将更新「最后更新」日期，并在适当时通过电邮或产品内通知。生效后继续使用即视为接受。不同意请停止使用并请求关闭账户。

### 15. 联系我们

> **相对 Reuben §15：** **改** 主体、地址、邮箱、PCPD。

JFO AI, Inc.（合域 AI）  
香港九龙红磡红鸾道 18 号中国人寿中心 9 楼  
电邮：support@heyu.hk  
私隐请求请用主题「数据请求」

香港主管机构：私隐专员公署 https://www.pcpd.org.hk  
内地：国家网信部门或当地主管部门（如适用）。
