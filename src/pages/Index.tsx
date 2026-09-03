import { Link } from "react-router-dom";
import { LandingScrollStage } from "@/components/landing/LandingScrollStage";
import { TRUST_ITEMS } from "@/components/landing/landing-content";
import { Navbar } from "@/components/Navbar";

export default function Index() {
  return (
    <div className="landing-page min-h-screen bg-[hsl(var(--hero-bg))] font-sans text-[hsl(var(--hero-foreground))]">
      <Navbar />

      <LandingScrollStage />

      <section
        className="scroll-mt-24 py-10 sm:py-12 lg:py-14"
        aria-label="平台特性"
      >
        <div className="landing-content-shell px-5 sm:px-8 md:px-12 lg:px-16">
            <ul
              id="trust"
              className="glass-bohemian-hero grid min-w-0 w-full grid-cols-2 overflow-hidden rounded-sm divide-x divide-y divide-[hsl(var(--hero-foreground)/0.1)] sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0"
            >
              {TRUST_ITEMS.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex flex-col items-center justify-center gap-2.5 px-3 py-5 text-center sm:px-4 sm:py-6"
                >
                  <Icon
                    className="h-[1.125rem] w-[1.125rem] shrink-0 text-[hsl(var(--wine)/0.95)]"
                    strokeWidth={1.25}
                  />
                  <span className="font-display text-[0.8rem] leading-snug tracking-[0.02em] text-[hsl(var(--hero-foreground)/0.9)]">
                    {label}
                  </span>
                </li>
              ))}
            </ul>
        </div>
      </section>

      <footer
        id="contact"
        className="scroll-mt-24 border-t border-[hsl(var(--hero-foreground)/0.08)]"
      >
        <div className="landing-content-shell px-5 py-14 sm:px-8 md:px-12 lg:px-16">
          <div className="grid grid-cols-1 gap-12 md:grid-cols-[1.4fr_1fr_1fr] md:gap-10 lg:grid-cols-[1.5fr_auto_auto_auto] lg:gap-x-14">
            <div>
              <p className="font-display text-2xl font-semibold tracking-[0.05em] text-[hsl(var(--wine))]">
                合域
              </p>
              <p className="mt-4 max-w-[22rem] text-[0.85rem] leading-[1.75] text-[hsl(var(--hero-muted))]">
                为家族办公室建立一个 AI 辅助、权限隔离、可持续更新的项目投研工作平台
              </p>
            </div>

            <div>
              <p className="mb-4 text-[0.7rem] tracking-[0.08em] text-[hsl(var(--hero-muted))]">
                法律信息
              </p>
              <nav className="flex flex-col gap-2.5" aria-label="法律信息">
                <Link
                  to="/privacy"
                  className="text-[0.85rem] text-[hsl(var(--hero-muted))] transition-colors hover:text-[hsl(var(--hero-foreground))]"
                >
                  隐私政策
                </Link>
                <Link
                  to="/terms"
                  className="text-[0.85rem] text-[hsl(var(--hero-muted))] transition-colors hover:text-[hsl(var(--hero-foreground))]"
                >
                  服务条款
                </Link>
              </nav>
            </div>

            <div>
              <p className="mb-4 text-[0.7rem] tracking-[0.08em] text-[hsl(var(--hero-muted))]">
                联系方式
              </p>
              <a
                href="mailto:support@heyu.hk"
                className="text-[0.85rem] text-[hsl(var(--hero-muted))] transition-colors hover:text-[hsl(var(--hero-foreground))]"
              >
                邮箱：support@heyu.hk
              </a>
            </div>

            <p className="text-[0.8rem] text-[hsl(var(--hero-muted)/0.75)] md:col-span-3 lg:col-span-1 lg:text-right">
              © {new Date().getFullYear()} 合域
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
