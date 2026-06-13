import { createAdminClient } from "@/lib/supabase/admin";
import type { AccountCode } from "@/types/account-codes";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeCode(code: string): string {
  return code.trim();
}

type AccountCodeRow = {
  id: string;
  user_id: string;
  account_email: string;
  code: string;
  label: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToAccountCode(row: AccountCodeRow): AccountCode {
  return {
    id: row.id,
    userId: row.user_id,
    accountEmail: row.account_email,
    code: row.code,
    label: row.label,
    archivedAt: row.archived_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAccountCodes(
  userId: string,
  accountEmail: string,
  options?: { includeArchived?: boolean },
): Promise<AccountCode[]> {
  const admin = createAdminClient();
  let query = admin
    .from("account_codes")
    .select("*")
    .eq("user_id", userId)
    .eq("account_email", normalizeEmail(accountEmail))
    .order("code", { ascending: true });

  if (!options?.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => rowToAccountCode(row as AccountCodeRow));
}

export async function listAllAccountCodes(
  userId: string,
  options?: { includeArchived?: boolean },
): Promise<AccountCode[]> {
  const admin = createAdminClient();
  let query = admin
    .from("account_codes")
    .select("*")
    .eq("user_id", userId)
    .order("account_email", { ascending: true })
    .order("code", { ascending: true });

  if (!options?.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => rowToAccountCode(row as AccountCodeRow));
}

export async function getAccountCodeById(
  userId: string,
  id: string,
): Promise<AccountCode | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("account_codes")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToAccountCode(data as AccountCodeRow) : null;
}

export async function upsertAccountCode(
  userId: string,
  input: { accountEmail: string; code: string; label: string },
): Promise<AccountCode> {
  const accountEmail = normalizeEmail(input.accountEmail);
  const code = normalizeCode(input.code);
  const label = input.label.trim();

  if (!accountEmail || !code || !label) {
    throw new Error("Account email, code, and label are required");
  }

  const admin = createAdminClient();
  const { data: existing, error: findError } = await admin
    .from("account_codes")
    .select("*")
    .eq("user_id", userId)
    .eq("account_email", accountEmail)
    .eq("code", code)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const { data, error } = await admin
      .from("account_codes")
      .update({
        label,
        archived_at: null,
      })
      .eq("id", existing.id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw error;
    return rowToAccountCode(data as AccountCodeRow);
  }

  const { data, error } = await admin
    .from("account_codes")
    .insert({
      user_id: userId,
      account_email: accountEmail,
      code,
      label,
    })
    .select("*")
    .single();

  if (error) throw error;
  return rowToAccountCode(data as AccountCodeRow);
}

export async function updateAccountCode(
  userId: string,
  id: string,
  updates: { label?: string; archived?: boolean },
): Promise<AccountCode> {
  const patch: Record<string, unknown> = {};

  if (updates.label !== undefined) {
    const label = updates.label.trim();
    if (!label) throw new Error("Label is required");
    patch.label = label;
  }

  if (updates.archived === true) {
    patch.archived_at = new Date().toISOString();
  } else if (updates.archived === false) {
    patch.archived_at = null;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error("No updates provided");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("account_codes")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return rowToAccountCode(data as AccountCodeRow);
}

export async function resolveAccountCodeAssignment(
  userId: string,
  accountCodeId: string | null | undefined,
): Promise<
  | {
      accountCodeId: string;
      accountCode: string;
      accountCodeLabel: string;
    }
  | {
      accountCodeId: undefined;
      accountCode: undefined;
      accountCodeLabel: undefined;
    }
> {
  if (!accountCodeId) {
    return {
      accountCodeId: undefined,
      accountCode: undefined,
      accountCodeLabel: undefined,
    };
  }

  const row = await getAccountCodeById(userId, accountCodeId);
  if (!row) {
    throw new Error("Account code not found");
  }

  return {
    accountCodeId: row.id,
    accountCode: row.code,
    accountCodeLabel: row.label,
  };
}
