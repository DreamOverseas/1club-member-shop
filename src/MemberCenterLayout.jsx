// src/MemberCenterLayout.jsx
import React, { useState } from "react";
import { Container, Button } from "react-bootstrap";
import MemberPointMarket from "./MemberPointMarket";
import MemberLoginModal from "./MemberLoginModal";
import MemberProfileCard from "./MemberProfileCard";
import useMemberAuth from "./hooks/useMemberAuth";

/**
 * 高阶布局组件：集成
 * - 登录弹窗
 * - 会员信息卡片（含修改密码/电话/登出）
 * - 积分商城
 *
 * props:
 * - cmsEndpoint: string               Strapi 地址，例如 https://api.do360.com
 * - cmsApiKey: string                 Strapi token
 * - couponEndpoint: string            券系统地址
 * - emailEndpoint: string             邮件服务地址
 * - title?: string                    页面标题，默认 "会员中心"
 * - texts?: {                         自定义文案（用于多语言）
 *     notLoggedIn?: string;          未登录提示
 *     loginButton?: string;          登录按钮文本
 *   }
 */
export default function MemberCenterLayout({
  cmsEndpoint,
  cmsApiKey,
  couponEndpoint,
  emailEndpoint,
  title = "会员中心",
  texts,
}) {
  // 从 cookie 读取会员信息（在 useMemberAuth 里实现）
  const { member, isLoggedIn } = useMemberAuth();
  const [showLogin, setShowLogin] = useState(false);

  // 文案：如果外部没传，就用中文默认
  const notLoggedInText =
    texts?.notLoggedIn ||
    "请先登录您的 1club 会员账号，以查看积分并兑换权益。";
  const loginButtonText = texts?.loginButton || "会员登录";

  return (
    <Container className="py-4">
      <h1 className="mb-3">{title}</h1>

      {/* 未登录：提示 + 登录按钮 + 登录弹窗 */}
      {!isLoggedIn && (
        <>
          <p className="text-muted mb-3">{notLoggedInText}</p>
          <Button variant="primary" onClick={() => setShowLogin(true)}>
            {loginButtonText}
          </Button>

          <MemberLoginModal
            show={showLogin}
            onClose={() => setShowLogin(false)}
            onLoginSuccess={() => {
              setShowLogin(false);
              // 登录成功后刷新页面，重新通过 cookie 读取 member
              window.location.reload();
            }}
          />
        </>
      )}

      {/* 已登录：会员信息卡片 + 积分商城 */}
      {isLoggedIn && member && (
        <>
          <MemberProfileCard
            member={member}
            cmsEndpoint={cmsEndpoint}
            cmsApiKey={cmsApiKey}
          />

          <MemberPointMarket
            cmsEndpoint={cmsEndpoint}
            cmsApiKey={cmsApiKey}
            couponEndpoint={couponEndpoint}
            emailEndpoint={emailEndpoint}
          />
        </>
      )}
    </Container>
  );
}
