import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

interface VerifyEmailTemplateProps {
  readonly name: string;
  readonly url: string;
}

export const VerifyEmailTemplate = ({
  name,
  url,
}: VerifyEmailTemplateProps) => (
  <Tailwind>
    <Html>
      <Head />
      <Preview>Verify your email address</Preview>
      <Body className="bg-zinc-50 font-sans">
        <Container className="mx-auto py-12">
          <Section className="mt-8 rounded-md bg-zinc-200 p-px">
            <Section className="rounded-[5px] bg-white p-8">
              <Text className="mt-0 mb-4 font-semibold text-2xl text-zinc-950">
                Verify your email
              </Text>
              <Text className="m-0 mb-6 text-zinc-500">
                Hi {name}, confirm this is your email address to finish setting
                up your account.
              </Text>
              <Button
                className="rounded-md bg-zinc-950 px-6 py-3 font-medium text-sm text-white"
                href={url}
              >
                Verify email
              </Button>
              <Text className="mt-6 mb-0 text-xs text-zinc-400">
                If you didn't create an account, you can ignore this email.
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  </Tailwind>
);

VerifyEmailTemplate.PreviewProps = {
  name: "Jane Smith",
  url: "https://example.com/verify?token=abc123",
};

// biome-ignore lint/complexity/noRedundantDefaultExport: react-email's preview server discovers templates by default export, while app code imports the named export.
export default VerifyEmailTemplate;
