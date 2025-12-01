// src/SingleProductRedeemPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  Button,
  Form,
  InputGroup,
  Row,
  Col,
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
 *      ProviderName
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
    if (n > maxDeduction) n = maxDeduction;
    setDeduction(n);
  };

  /**
   * 🔥 核心函数：更新 Strapi 会员积分并记录券
   */
  async function updateUserPoint(couponCid) {
    const membershipUrl = `${cmsEndpoint}/api/one-club-memberships?filters[MembershipNumber][$eq]=${currUser.number}&populate=*`;

    const res = await fetch(membershipUrl, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cmsApiKey}`,
      },
    });

    const data = await res.json();
    const membership = data?.data?.[0];
    if (!membership) throw new Error("Membership not found");

    const id = membership.id;

    const newPoint = cash - (price - deduction);
    const newDiscountPoint = discountPoint - deduction;

    const updateRes = await fetch(
      `${cmsEndpoint}/api/one-club-memberships/${id}`,
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
            MyCoupon: [...(membership?.MyCoupon || []), couponCid],
          },
        }),
      }
    );

    const updateJson = await updateRes.json();

    // 更新 cookie 中的会员信息
    const newUser = {
      ...currUser,
      points: newPoint,
      discount_point: newDiscountPoint,
    };
    setCurrentMember(newUser);

    return updateJson;
  }

  /**
   * 🔥 核心函数：创建 coupon + 发邮件 + 更新积分
   */
  async function handleRedeem() {
    if (!isLoggedIn) return;

    setLoading(true);
    try {
      const couponPayload = {
        reward_name: product.Name,
        instruction: product.Description || "",
        validity_day: 365,
        category: "one_club",
        price: price - deduction,
        provider: product.ProviderName || "",
      };

      const couponRes = await fetch(
        `${couponEndpoint}/create-active-coupon`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(couponPayload),
        }
      );

      const couponData = await couponRes.json();
      const couponCid = couponData?.cid;

      if (!couponCid) throw new Error("Failed to create coupon");

      // 发邮件
      await fetch(`${emailEndpoint}/1club/coupon_distribute`, {
        method: "POST",
        body: JSON.stringify({
          name: currUser.name || "",
          customer_email: currUser.email,
          couponid: couponCid,
          coupon_value: price - deduction,
        }),
      });

      // 更新积分 + MyCoupon
      await updateUserPoint(couponCid);

      alert("兑换成功！我们已将优惠券发送到您的邮箱。");

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
