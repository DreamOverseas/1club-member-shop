// src/hooks/useMemberAuth.js
import { useMemo } from "react";
import Cookies from "js-cookie";

/**
 * 从 cookie 中读取当前会员信息
 * - 没有登录 → 返回 null
 * - JSON 解析失败 → 返回 null
 */
export function getCurrentMember() {
  const cookieStr = Cookies.get("user");
  if (!cookieStr) return null;

  try {
    const parsed = JSON.parse(cookieStr);
    return parsed || null;
  } catch (err) {
    console.error("[getCurrentMember] Failed to parse cookie 'user':", err);
    return null;
  }
}

/**
 * 把会员信息写回 cookie
 * - member 为 null/undefined 时，相当于登出（删除 cookie）
 * - 默认 7 天过期，可通过 options 覆盖
 */
export function setCurrentMember(member, options) {
  if (!member) {
    Cookies.remove("user");
    return;
  }

  const defaultOptions = { expires: 7 };
  Cookies.set("user", JSON.stringify(member), {
    ...defaultOptions,
    ...(options || {}),
  });
}

/**
 * 简单判断是否已登录
 */
export function isMemberLoggedIn() {
  return !!getCurrentMember();
}

/**
 * React hook：在组件里用
 * 返回：
 * - member: 当前会员对象（或 null）
 * - isLoggedIn: 是否已登录
 */
export default function useMemberAuth() {
  const { member, isLoggedIn } = useMemo(() => {
    const member = getCurrentMember();
    return {
      member,
      isLoggedIn: !!member,
    };
  }, []);

  return { member, isLoggedIn };
}
