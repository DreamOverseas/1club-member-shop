// src/hooks/useMemberAuth.js
import { useState, useEffect } from "react";
import Cookies from "js-cookie";

const COOKIE_KEY = "user";

/**
 * 读取当前会员信息（不依赖 React，可以在任何地方用）
 */
export function getCurrentMember() {
  try {
    const raw = Cookies.get(COOKIE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error("[useMemberAuth] Failed to parse user cookie:", e);
    return null;
  }
}

/**
 * React hook：在组件里方便使用当前会员信息
 */
export function useMemberAuth() {
  const [member, setMember] = useState(() => getCurrentMember());

  useEffect(() => {
    // 简单处理：挂载时读一次 Cookie
    // 如果你以后想做到“实时响应登录状态变化”，可以再加事件机制
    setMember(getCurrentMember());
  }, []);

  const isLoggedIn = !!member;

  return { member, isLoggedIn };
}
