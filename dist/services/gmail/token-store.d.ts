import type { AccountConfig, TokenData, StoredAccount } from "./types.js";
export declare function listAccounts(): Promise<AccountConfig[]>;
export declare function saveAccountConfig(config: AccountConfig): Promise<void>;
export declare function saveTokens(email: string, tokens: TokenData): Promise<void>;
export declare function getTokens(email: string): Promise<TokenData | null>;
export declare function getStoredAccount(email: string): Promise<StoredAccount | null>;
export declare function removeAccount(email: string): Promise<boolean>;
