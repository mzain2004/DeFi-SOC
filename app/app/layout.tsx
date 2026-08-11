import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";


export const metadata: Metadata = {
  title: "PhishSlayer",
  description: "Agent-assisted SOC prototype for MSSPs",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "512x512" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      appearance={{
        variables: {
          colorBackground: "#080D12",
          colorText: "#F0F6FC",
          colorTextSecondary: "#A9B4C0",
          colorPrimary: "#7C5CFF",
          colorDanger: "#EF4444",
          colorInputBackground: "#0D1117",
          colorInputText: "#F0F6FC",
          colorNeutral: "#243244",
          borderRadius: "0.75rem",
        },
        elements: {
          card: "bg-[#080D12] border border-[#243244] text-[#F0F6FC] shadow-2xl shadow-black/50",
          modalBackdrop: "bg-black/75 backdrop-blur-sm",
          modalContent: "border border-[#243244] bg-[#080D12] text-[#F0F6FC] shadow-2xl shadow-black/65",
          rootBox: "text-[#F0F6FC]",
          cardBox: "text-[#F0F6FC]",
          headerTitle: "text-[#F0F6FC] font-bold tracking-tight",
          headerSubtitle: "text-[#A9B4C0]",
          socialButtonsBlockButton:
            "bg-[#0D1117] border border-[#243244] text-[#F0F6FC] hover:bg-[#161B22] hover:border-[#7C5CFF]",
          socialButtonsBlockButtonText: "text-[#F0F6FC] font-medium",
          dividerLine: "bg-[#243244]",
          dividerText: "text-[#A9B4C0]",
          formFieldLabel: "text-[#D7E0EA] font-semibold",
          formFieldInput:
            "bg-[#080D12] border-[#243244] text-[#F0F6FC] placeholder:text-[#6E7D8E] focus:border-[#7C5CFF] focus:ring-[#7C5CFF]",
          formFieldHintText: "text-[#A9B4C0]",
          formFieldSuccessText: "text-[#86EFAC]",
          formFieldWarningText: "text-[#FBBF24]",
          formFieldErrorText: "text-[#FCA5A5]",
          formFieldAction: "text-[#9AA8FF] hover:text-[#C9D1FF] font-medium",
          formButtonPrimary:
            "bg-[#7C5CFF] hover:bg-[#6B4EE6] text-white shadow-md shadow-[#7C5CFF]/10",
          formButtonReset: "border border-[#243244] bg-[#0D1117] text-[#D7E0EA] hover:bg-[#161B22]",
          footerActionText: "text-[#A9B4C0]",
          footerActionLink: "text-[#9AA8FF] hover:text-[#C9D1FF] font-semibold",
          identityPreviewText: "text-[#F0F6FC]",
          identityPreviewEditButton: "text-[#9AA8FF] hover:text-[#C9D1FF]",
          otpCodeFieldInput:
            "bg-[#080D12] border-[#243244] text-[#F0F6FC] focus:border-[#7C5CFF]",
          formResendCodeLink: "text-[#9AA8FF] hover:text-[#C9D1FF]",
          alertText: "text-[#F0F6FC]",
          formHeaderTitle: "text-[#F0F6FC]",
          formHeaderSubtitle: "text-[#A9B4C0]",
          avatarBox: "ring-1 ring-[#243244] bg-[#080D12]",
          navbar: "border-b border-[#243244] bg-[#080D12]",
          navbarMobileMenuRow: "border-b border-[#243244] bg-[#080D12]",
          navbarMobileMenuButton: "text-[#A9B4C0] hover:text-[#F0F6FC]",
          navbarButton: "text-[#A9B4C0] hover:bg-[#161B22] hover:text-[#F0F6FC]",
          navbarButtonActive: "bg-[#161B22] text-[#C9D1FF]",
          pageScrollBox: "bg-[#080D12] text-[#F0F6FC]",
          page: "bg-[#080D12] text-[#F0F6FC]",
          profilePage: "bg-[#080D12] text-[#F0F6FC]",
          profileSection: "border border-[#243244] bg-[#0D1117] text-[#F0F6FC]",
          profileSectionTitle: "text-[#F8FAFC]",
          profileSectionTitleText: "text-[#F8FAFC] font-semibold",
          profileSectionContent: "text-[#CBD5E1]",
          accordionTriggerButton: "text-[#F0F6FC] hover:bg-[#161B22]",
          accordionTriggerButtonIcon: "text-[#A9B4C0]",
          badge: "border border-[#243244] bg-[#111827] text-[#CBD5E1]",
          breadcrumbText: "text-[#A9B4C0]",
          breadcrumbLink: "text-[#C9D1FF] hover:text-[#F0F6FC]",
          menuList: "border border-[#243244] bg-[#080D12] text-[#F0F6FC] shadow-2xl shadow-black/65",
          menuItem: "text-[#F0F6FC] hover:bg-[#161B22]",
          menuButton: "text-[#F0F6FC] hover:bg-[#161B22]",
          menuAction: "text-[#F0F6FC]",
          menuActionText: "text-[#F0F6FC]",
          menuSeparator: "bg-[#243244]",
          userButtonPopoverCard:
            "bg-[#080D12] border border-[#243244] text-[#F0F6FC] shadow-2xl shadow-black/65",
          userButtonPopoverMain: "bg-[#080D12] text-[#F0F6FC]",
          userButtonPopoverActions: "bg-[#080D12]",
          userButtonPopoverActionButton:
            "text-[#F0F6FC] hover:text-white hover:bg-[#161B22]",
          userButtonPopoverActionButton__manageAccount:
            "text-[#F0F6FC] hover:text-white hover:bg-[#161B22]",
          userButtonPopoverActionButton__signOut:
            "text-[#F0F6FC] hover:text-white hover:bg-[#161B22]",
          userButtonPopoverActionButtonText: "text-[#F0F6FC] font-medium",
          userButtonPopoverActionButtonIcon: "text-[#A9B4C0]",
          userButtonPopoverFooter:
            "border-t border-[#243244] bg-[#080D12] text-[#A9B4C0]",
          userPreviewMainIdentifier: "text-[#F0F6FC] font-semibold",
          userPreviewSecondaryIdentifier: "text-[#C1CCD8]",
          userProfileModeIcon: "text-[#A9B4C0]",
        },
      }}
    >
      <html lang="en">
        <body className="font-sans antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
