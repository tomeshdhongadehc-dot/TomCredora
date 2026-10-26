"use client";

import { useSyncExternalStore } from "react";
import { getAccountState, getServerAccountState, subscribeAccount } from "./store";

export const useAccount = () => useSyncExternalStore(subscribeAccount, getAccountState, getServerAccountState);
