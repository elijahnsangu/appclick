import { fonts } from "@repo/design-system/lib/fonts";
import { cn } from "@repo/design-system/lib/utils";
import Document, {
  type DocumentContext,
  type DocumentInitialProps,
  Head,
  Html,
  Main,
  NextScript,
} from "next/document";

interface MarketplaceDocumentProps extends DocumentInitialProps {
  locale: string;
}

export default class MarketplaceDocument extends Document<MarketplaceDocumentProps> {
  static async getInitialProps(
    context: DocumentContext
  ): Promise<MarketplaceDocumentProps> {
    const initialProperties = await Document.getInitialProps(context);
    return {
      ...initialProperties,
      locale:
        typeof context.query.locale === "string" ? context.query.locale : "en",
    };
  }

  render() {
    return (
      <Html
        className={cn(fonts, "scroll-smooth")}
        data-scroll-behavior="smooth"
        lang={this.props.locale}
        suppressHydrationWarning
      >
        <Head />
        <body className="theme-marliket">
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
