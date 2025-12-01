// src/SingleProductRedeemPanel.jsx
import React, { useMemo, useState } from "react";
import {
  Card,
  Button,
  Form,
  InputGroup,
  Spinner,
} from "react-bootstrap";

import {
  getCurrentMember,
  setCurrentMember,
} from "./hooks/useMemberAuth";

/**
 * SingleProductRedeemPanel 组件
 * 用于在任何页面使用「现金 + 360币」进行兑换
 *
 * Props:
 * - cmsEndpoint
 * - cmsApiKey
 * - couponEndpoint
 * - emailEndpoint
 * - product: {
 *      Name,
 *      Price,
 *      MaxDeduction,
 *      Description,
 *      ProviderName 或 Provider?.Name
 *   }
 * - onSuccess(): 可选，兑换成功后的回调
 */

export default function SingleProductRedeemPanel({
  cmsEndpoint,
  cmsApiKey,
  couponEndpoint,
  emailEndpoint,
  product,
  onSuccess,
}) {
  const currUser = getCurrentMember() || {};
  const isLoggedIn = !!currUser?.number;

  const [deduction, setDeduction] = useState(0);
  const [loading, setLoading] = useState(false);

  const price = Number(product?.Price || 0);
  const maxDeduction = useMemo(
    () => Math.min(Number(product?.MaxDeduction || 0), price),
    [price, product]
  );

  const cash = currUser?.points || 0;
  const discountPoint = currUser?.discount_point || 0;

  const remainingCash = cash - price + deduction;
  const remainingDiscount = discountPoint - deduction;

  const sufficientCash = cash >= price - deduction;
  const sufficientDiscount = discountPoint - deduction >= 0;

  const canRedeem =
    isLoggedIn && sufficientCash && sufficientDiscount && !loading;

  const handleDeductionInput = (value) => {
    let n = Number(value);
    if (Number.isNaN(n)) n = 0;
    if (n < 0) n = 0;
    // 同时受 MaxDeduction 和 当前 360 币余额限制
    n = Math.min(n, maxDeduction, discountPoint);
    setDeduction(n);
  };

  /**
   * 🔥 更新 Strapi 会员积分 & MyCoupon（和 MemberPointMarket 同逻辑）
   */
  async function updateUserPoint(couponCid) {
    const latestUser = getCurrentMember() || {};

    if (!latestUser.number || !latestUser.email) {
      throw new Error("Missing membership number or email");
    }

    const membershipUrl = `${cmsEndpoint}/api/one-club-memberships` +
      `?filters[MembershipNumber][$eq]=${latestUser.number}` +
      `&filters[Email][$eq]=${latestUser.email}` +
      `&populate=MyCoupon`;

    const res = await fetch(membershipUrl, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cmsApiKey}`,
      },
    });

    const data = await res.json();
    const membership = data?.data?.[0];
    if (!membership) throw new Error("Membership not found");

    // Strapi v5 建议使用 documentId
    const documentId = membership.documentId;
    const oldPoint = membership.Point || 0;
    const oldDiscountPoint = membership.DiscountPoint || 0;

    const newPoint = oldPoint - (price - deduction);
    const newDiscountPoint = oldDiscountPoint - deduction;

    // 已有关联券的 documentId 列表
    const existingCoupons =
      membership.MyCoupon?.map((c) => c.documentId) ?? [];
    const updatedCoupons = [...new Set([...existingCoupons, couponCid])];

    const updateRes = await fetch(
      `${cmsEndpoint}/api/one-club-memberships/${documentId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cmsApiKey}`,
        },
        body: JSON.stringify({
          data: {
            Point: newPoint,
            DiscountPoint: newDiscountPoint,
            MyCoupon: updatedCoupons,
          },
        }),
      }
    );

    if (!updateRes.ok) {
      const errJson = await updateRes.json().catch(() => ({}));
      console.error("Update membership error:", errJson);
      throw new Error("Update membership failed");
    }

    // 更新 cookie 中的会员信息
    const newUser = {
      ...latestUser,
      points: newPoint,
      discount_point: newDiscountPoint,
    };
    setCurrentMember(newUser);
  }

  /**
   * 🔥 创建 coupon + 发邮件 + 更新积分
   *   —— 对齐 1club-website / MemberPointMarket 的接口格式
   */
  async function handleRedeem() {
    if (!isLoggedIn) return;

    setLoading(true);
    try {
      const latestUser = getCurrentMember() || {};
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);

      const providerName =
        product.ProviderName ||
        product.Provider?.Name ||
        "";

      // 1) 创建 active coupon
      const couponPayload = {
        title: product.Name,
        description: product.Description || "",
        expiry: expiryDate.toISOString(),
        assigned_from: providerName,
        assigned_to: latestUser.name || "",
        value: price - deduction,
      };

      const couponRes = await fetch(
        `${couponEndpoint}/create-active-coupon`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(couponPayload),
          mode: "cors",
          credentials: "include",
        }
      );

      const couponData = await couponRes.json();

      if (
        !couponRes.ok ||
        couponData.couponStatus !== "active"
      ) {
        console.error("Coupon system error:", couponData);
        throw new Error("Failed to create active coupon");
      }

      const { QRdata, cid } = couponData;
      if (!cid) {
        throw new Error("Coupon cid missing");
      }

      // 2) 邮件服务：发送券邮件
      const emailPayload = {
        name: latestUser.name || "",
        email: latestUser.email,
        data: QRdata,
        title: product.Name,
      };

      const emailRes = await fetch(
        `${emailEndpoint}/1club/coupon_distribute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(emailPayload),
          mode: "cors",
          credentials: "include",
        }
      );

      if (!emailRes.ok) {
        const emailErr = await emailRes.json().catch(() => ({}));
        console.error("Email API error:", emailErr);
        throw new Error("Send coupon email failed");
      }

      // 3) 更新 Strapi 积分 & MyCoupon
      await updateUserPoint(cid);

      alert("兑换成功，我们已将优惠券发送至您的邮箱。");

      if (onSuccess) onSuccess();
    } catch (e) {
      console.error("Redeem error", e);
      alert("兑换失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <Card.Body>
        <h5 className="mb-3">确认兑换</h5>

        <p>
          商品：<b>{product?.Name}</b>
        </p>
        <p>价格：{price} 现金</p>

        {isLoggedIn ? (
          <>
            <p>
              现金：{cash} → 兑换后余额{" "}
              <b>{remainingCash}</b>
            </p>
            <p>
              360币：{discountPoint} → 兑换后余额{" "}
              <b>{remainingDiscount}</b>
            </p>

            {!sufficientCash && (
              <p style={{ color: "red" }}>现金不足</p>
            )}
            {!sufficientDiscount && (
              <p style={{ color: "red" }}>360币不足</p>
            )}

            {maxDeduction > 0 && (
              <Form.Group className="mt-3">
                <Form.Label>
                  点数抵扣 ({deduction}/{maxDeduction})
                </Form.Label>

                <Form.Range
                  min={0}
                  max={maxDeduction}
                  step={1}
                  value={deduction}
                  onChange={(e) =>
                    handleDeductionInput(e.target.value)
                  }
                />

                <InputGroup className="mt-2">
                  <Form.Control
                    type="number"
                    min={0}
                    max={maxDeduction}
                    value={deduction}
                    onChange={(e) =>
                      handleDeductionInput(e.target.value)
                    }
                  />
                  <Button
                    variant="outline-secondary"
                    onClick={() =>
                      handleDeductionInput(
                        Math.min(maxDeduction, discountPoint)
                      )
                    }
                  >
                    Max
                  </Button>
                </InputGroup>
              </Form.Group>
            )}

            <p className="mt-3">
              注：兑换成功后的核销券有效期为一年，请注意哦！
            </p>
          </>
        ) : (
          <p style={{ color: "red" }}>
            请先登录会员中心再使用现金或 360 币支付。
          </p>
        )}
      </Card.Body>

      <Card.Footer>
        <Button
          variant={canRedeem ? "dark" : "secondary"}
          className="w-100"
          disabled={!canRedeem}
          onClick={handleRedeem}
        >
          {loading ? (
            <Spinner size="sm" />
          ) : !isLoggedIn ? (
            "请先登录"
          ) : sufficientCash && sufficientDiscount ? (
            "确认兑换"
          ) : !sufficientCash ? (
            "现金不足"
          ) : (
            "360币不足"
          )}
        </Button>
      </Card.Footer>
    </Card>
  );
}
