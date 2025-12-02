// src/SingleProductRedeemPanel.jsx
import React, { useMemo, useState } from "react";
import {
  Card,
  Button,
  Form,
  InputGroup,
} from "react-bootstrap";

import {
  getCurrentMember,
  setCurrentMember,
} from "./hooks/useMemberAuth";

/**
 * 单品兑换面板：给 Media360 用的“现金或360币支付”
 *
 * Props:
 * - cmsEndpoint    : Strapi API 基地址
 * - cmsApiKey      : Strapi 只读/写入 token
 * - couponEndpoint : 优惠券系统地址，比如 https://server.coupon.do360.com
 * - emailEndpoint  : 邮件服务地址
 * - product: {
 *      Name,           // 商品名
 *      Price,          // 价格（现金点）
 *      MaxDeduction,   // 最大可抵扣点数
 *      Description,    // 商品描述
 *      ProviderName,   // 发券方（商家名称，可选）
 *   }
 * - onSuccess()    : 兑换成功后的回调（可选）
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
    if (n > maxDeduction) n = maxDeduction;
    setDeduction(n);
  };

  /**
   * 更新 Strapi 里的积分 + MyCoupon，并同步 cookie
   * （结构和 MemberPointMarket.jsx 保持一致）
   */
  async function updateUserPoint(couponCid) {
    const latestUser = getCurrentMember() || {};
    if (!latestUser.number || !latestUser.email) {
      console.error("Cannot update user points: missing number or email");
      return;
    }

    // 根据会员号 + 邮箱查 membership 记录
    const userQueryUrl =
      `${cmsEndpoint}/api/one-club-memberships` +
      `?filters[MembershipNumber][$eq]=${encodeURIComponent(
        latestUser.number
      )}` +
      `&filters[Email][$eq]=${encodeURIComponent(
        latestUser.email
      )}` +
      `&populate=MyCoupon`;

    const userResponse = await fetch(userQueryUrl, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cmsApiKey}`,
      },
    });

    if (!userResponse.ok) {
      console.error("Failed to fetch membership record");
      return;
    }

    const userJson = await userResponse.json();
    const userRecord = userJson?.data?.[0];
    if (!userRecord) {
      console.error("Membership record not found");
      return;
    }

    const memberId = userRecord.id;
    const currentPoint = Number(userRecord.Point || 0);
    const currentDiscountPoint = Number(userRecord.DiscountPoint || 0);

    // 按照商城同样的规则扣减
    const newPoint = currentPoint - (price - deduction);
    const newDiscountPoint = currentDiscountPoint - deduction;

    const existingCoupons =
      userRecord.MyCoupon?.map((c) => c.documentId) ?? [];
    const updatedCoupons = [...new Set([...existingCoupons, couponCid])];

    const updatePayload = {
      data: {
        Point: newPoint,
        DiscountPoint: newDiscountPoint,
        MyCoupon: updatedCoupons,
      },
    };

    const updateResponse = await fetch(
      `${cmsEndpoint}/api/one-club-memberships/${memberId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cmsApiKey}`,
        },
        body: JSON.stringify(updatePayload),
      }
    );

    if (!updateResponse.ok) {
      const updateError = await updateResponse.json().catch(() => ({}));
      console.error("Error updating user info:", updateError.message);
    } else {
      console.log("Membership updated successfully");
    }

    // 更新 cookie 里的用户积分
    const newUser = {
      ...latestUser,
      points: newPoint,
      discount_point: newDiscountPoint,
    };
    setCurrentMember(newUser);
  }

  /**
   * 核心：创建 active coupon + 发送邮件 + 更新积分
   * 这里完全照抄 MemberPointMarket.jsx 的结构
   */
  async function handleRedeem() {
    if (!isLoggedIn) return;

    setLoading(true);

    try {
      const latestUser = getCurrentMember() || {};
      const expiryDate = new Date();
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);

      // 🚩 动态决定 assigned_from
      let assignedFrom = product.ProviderName || "";

      if (!assignedFrom && typeof window !== "undefined") {
        const host = window.location.hostname || "";
        if (host.includes("1club")) {
          assignedFrom = "1club";
        } else if (host.includes("360")) {
          assignedFrom = "360media";
        }
      }

      if (!assignedFrom) {
        assignedFrom = "1club"; // 最终兜底
      }

      // 🚩 兜底 assigned_to
      const assignedTo =
        latestUser.name ||
        latestUser.username ||
        latestUser.displayName ||
        "会员";

      // 🚀 最终 payload
      const couponPayload = {
        title: product.Name,
        description: product.Description || "",
        expiry: expiryDate.toISOString(),
        assigned_from: assignedFrom,
        assigned_to: assignedTo,
        value: Number(price - deduction),
      };

      // 1) 在优惠券系统创建 active 券
      const couponResponse = await fetch(
        `${couponEndpoint}/create-active-coupon`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(couponPayload),
          mode: "cors",
          credentials: "include",
        }
      );

      const couponData = await couponResponse.json();

      if (couponResponse.ok && couponData.couponStatus === "active") {
        const QRdata = couponData.QRdata;

        // 2) 调用邮件服务发送券
        const emailPayload = {
          name: latestUser.name,
          email: latestUser.email,
          data: QRdata,
          title: product.Name,
        };

        const emailResponse = await fetch(
          `${emailEndpoint}/1club/coupon_distribute`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(emailPayload),
            mode: "cors",
            credentials: "include",
          }
        );

        if (emailResponse.ok) {
          // 3) 券发出成功之后，更新积分 + MyCoupon
          await updateUserPoint(couponData.cid);

          console.log("Redeemed.");
          setLoading(false);
          setDeduction(0);

          alert("兑换成功！我们已将优惠券发送到您的邮箱。");

          if (onSuccess) onSuccess();
        } else {
          const emailError = await emailResponse.json().catch(() => ({}));
          console.error("Email API error:", emailError.message);
          setLoading(false);
          setDeduction(0);
          alert("兑换失败（发券邮件失败），请稍后重试。");
        }
      } else {
        console.error("Coupon system error:", couponData);
        setLoading(false);
        setDeduction(0);
        alert("兑换失败（券系统返回失败），请稍后重试。");
      }
    } catch (err) {
      console.error("Redeem error:", err);
      setLoading(false);
      setDeduction(0);
      alert("兑换失败，请稍后重试。");
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
              现金：{cash} → 兑换后余额 <b>{remainingCash}</b>
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
                      handleDeductionInput(maxDeduction)
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
          {loading
            ? "处理中..."
            : !isLoggedIn
            ? "请先登录"
            : sufficientCash && sufficientDiscount
            ? "确认兑换"
            : !sufficientCash
            ? "现金不足"
            : "360币不足"}
        </Button>
      </Card.Footer>
    </Card>
  );
}
