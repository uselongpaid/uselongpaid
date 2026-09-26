"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { chain } from "@/lib/chain.ts";

type Eip1193 = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, fn: (...args: unknown[]) => void): void;
  removeListener?(event: string, fn: (...args: unknown[]) => void): void;
};

type WalletState = {
  address: string | null;
  chainId: number | null;
  onRightChain: boolean;
  hasWallet: boolean;
  connecting: boolean;
  error: string | null;
  connect(): Promise<void>;
  switchChain(): Promise<void>;
  disconnect(): void;
  signMessage(message: string): Promise<string>;
};

const Ctx = createContext<WalletState | null>(null);
const HEX_CHAIN = "0x" + chain.id.toString(16);

function provider(): Eip1193 | null {
  return typeof window === "undefined" ? null : ((window as unknown as { ethereum?: Eip1193 }).ethereum ?? null);
}

function readable(e: unknown): string {
  const err = e as { code?: number; message?: string };
  if (err?.code === 4001) return "Request rejected in the wallet.";
  return err?.message?.split("\n")[0] ?? "Wallet error.";
}

/** Browser-wallet (EIP-1193) connection, pinned to the site's chain (Robinhood Chain by default). */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [hasWallet, setHasWallet] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eth = provider();
    setHasWallet(Boolean(eth));
    if (!eth) return;
    const onAccounts = (a: unknown) => setAddress((a as string[])[0] ?? null);
    const onChain = (c: unknown) => setChainId(parseInt(String(c), 16));
    // Restore a connection the user already approved, without prompting.
    eth.request({ method: "eth_accounts" }).then(onAccounts).catch(() => {});
    eth.request({ method: "eth_chainId" }).then(onChain).catch(() => {});
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const switchChain = useCallback(async () => {
    const eth = provider();
    if (!eth) return;
    setError(null);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: HEX_CHAIN }] });
    } catch (e) {
      if ((e as { code?: number }).code !== 4902) return setError(readable(e));
      // The wallet doesn't know the chain yet: add it.
      try {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: HEX_CHAIN,
              chainName: chain.name,
              nativeCurrency: chain.nativeCurrency,
              rpcUrls: [chain.rpcUrl],
              blockExplorerUrls: [chain.explorerUrl],
            },
          ],
        });
      } catch (e2) {
        setError(readable(e2));
      }
    }
  }, []);

  const connect = useCallback(async () => {
    const eth = provider();
    if (!eth) return setError("No browser wallet found. Install MetaMask, Rabby or another EVM wallet.");
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(accounts[0] ?? null);
      const id = parseInt(String(await eth.request({ method: "eth_chainId" })), 16);
      setChainId(id);
      if (id !== chain.id) await switchChain();
    } catch (e) {
      setError(readable(e));
    } finally {
      setConnecting(false);
    }
  }, [switchChain]);

  const signMessage = useCallback(
    async (message: string) => {
      const eth = provider();
      if (!eth || !address) throw new Error("Connect a wallet first.");
      try {
        return (await eth.request({ method: "personal_sign", params: [message, address] })) as string;
      } catch (e) {
        throw new Error(readable(e));
      }
    },
    [address],
  );

  const value: WalletState = {
    address,
    chainId,
    onRightChain: chainId === chain.id,
    hasWallet,
    connecting,
    error,
    connect,
    switchChain,
    disconnect: () => setAddress(null),
    signMessage,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet must be used inside WalletProvider");
  return v;
}

export function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
