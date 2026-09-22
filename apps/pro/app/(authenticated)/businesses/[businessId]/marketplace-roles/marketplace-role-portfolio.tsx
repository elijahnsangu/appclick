"use client";

import type { ApiError } from "@repo/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/rpc";
import {
  getMarketplaceRolePortfolioViewModel,
  type MarketplaceRoleViewModel,
} from "./marketplace-role-view-model";
import {
  discardSensitiveMarketplaceRolePortfolioQueries,
  fetchMarketplaceRolePortfolio,
  type MarketplaceRolePortfolioData,
  marketplaceRoleKeys,
  mustDiscardSensitiveMarketplaceRoleData,
} from "./queries";

interface MarketplaceRolePortfolioProperties {
  readonly businessId: string;
  readonly initialPortfolio: MarketplaceRolePortfolioData;
}

const dateFormatter = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  timeZone: "Africa/Lusaka",
});

function deadline(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : "Not scheduled";
}

function statusVariant(model: MarketplaceRoleViewModel) {
  if (model.effectiveEligibility.eligible) {
    return "default" as const;
  }
  if (
    model.continuingEligibility.state === "SUSPENDED" ||
    model.continuingEligibility.state === "REVOKED" ||
    model.evidence.status === "EXPIRED" ||
    model.attestation.status === "OVERDUE"
  ) {
    return "destructive" as const;
  }
  return "secondary" as const;
}

export function MarketplaceRolePortfolio({
  businessId,
  initialPortfolio,
}: MarketplaceRolePortfolioProperties) {
  const queryClient = useQueryClient();
  const [terminalError, setTerminalError] = useState<ApiError | null>(null);
  const portfolio = useQuery({
    enabled: terminalError === null,
    initialData: terminalError === null ? initialPortfolio : undefined,
    queryFn: () => fetchMarketplaceRolePortfolio(api, businessId),
    queryKey: marketplaceRoleKeys.portfolio(businessId),
  });
  const terminalReadError = mustDiscardSensitiveMarketplaceRoleData(
    portfolio.error
  )
    ? portfolio.error
    : null;

  useEffect(() => {
    if (terminalReadError) {
      setTerminalError((current) => current ?? terminalReadError);
    }
  }, [terminalReadError]);

  useEffect(() => {
    if (terminalError) {
      discardSensitiveMarketplaceRolePortfolioQueries(
        queryClient,
        businessId
      ).catch(() => undefined);
    }
  }, [businessId, queryClient, terminalError]);

  if (terminalError ?? terminalReadError) {
    return (
      <Alert
        aria-live="assertive"
        className="border-destructive/40 bg-destructive/5"
        role="alert"
      >
        <AlertTitle>Marketplace Roles unavailable</AlertTitle>
        <AlertDescription>
          This private portfolio is no longer available to this session.
        </AlertDescription>
      </Alert>
    );
  }
  const models = getMarketplaceRolePortfolioViewModel(
    portfolio.data ?? initialPortfolio
  );

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
      {models.map((model) => (
        <Card
          className="min-w-0 border-marliket-line bg-marliket-bg-1 shadow-none"
          key={model.role}
        >
          <CardHeader className="min-w-0 grid-cols-[minmax(0,1fr)_auto]">
            <CardTitle className="min-w-0 text-xl">
              <h2>{model.label}</h2>
            </CardTitle>
            <Badge variant={statusVariant(model)}>
              {model.effectiveEligibility.label}
            </Badge>
          </CardHeader>
          <CardContent className="min-w-0 flex-1">
            <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-4 text-sm">
              <div className="min-w-0">
                <dt className="text-marliket-ink-2">Application</dt>
                <dd className="mt-1 break-words font-medium">
                  {model.application.label}
                </dd>
                {model.lifecycle.number ? (
                  <dd className="mt-0.5 break-words text-marliket-ink-2 text-xs">
                    Lifecycle {model.lifecycle.number}
                    {model.lifecycle.priorCount > 0
                      ? `, ${model.lifecycle.priorCount} prior`
                      : ""}
                  </dd>
                ) : null}
              </div>
              <div className="min-w-0">
                <dt className="text-marliket-ink-2">Continuing role</dt>
                <dd className="mt-1 break-words font-medium">
                  {model.continuingEligibility.label}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-marliket-ink-2">Evidence</dt>
                <dd className="mt-1 break-words font-medium">
                  {model.evidence.label}
                </dd>
                <dd className="mt-0.5 break-words text-marliket-ink-2 text-xs">
                  {deadline(model.evidence.deadline)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-marliket-ink-2">Annual attestation</dt>
                <dd className="mt-1 break-words font-medium">
                  {model.attestation.label}
                </dd>
                <dd className="mt-0.5 break-words text-marliket-ink-2 text-xs">
                  {deadline(model.attestation.deadline)}
                </dd>
              </div>
            </dl>
            {model.correction ? (
              <p className="mt-5 min-w-0 break-words rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                {model.correction}
              </p>
            ) : null}
            {model.reconsideration.status === "AVAILABLE" ? (
              <p className="mt-3 text-marliket-ink-2 text-sm">
                Reconsideration is available until{" "}
                {deadline(model.reconsideration.deadline)}.
              </p>
            ) : null}
          </CardContent>
          <CardFooter className="mt-auto min-w-0">
            <Button asChild className="w-full min-w-0 sm:w-auto">
              <Link
                href={`/businesses/${businessId}/marketplace-roles/${model.role}`}
              >
                <span className="min-w-0 truncate">
                  {model.primaryAction.label}
                </span>
              </Link>
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
