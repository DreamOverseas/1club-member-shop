// src/MemberPointMarket.jsx
import React, { useState, useEffect, useMemo } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Modal,
  Form,
  InputGroup,
} from "react-bootstrap";

// 样式 & 小组件 & hooks
import "./styles/member-shop.css";
import AlternatingText from "./components/AlternatingText";
import { getCurrentMember, setCurrentMember } from "./hooks/useMemberAuth";

/**
 * 积分商城主组件
 *
 * props:
 * - cmsEndpoint:    string   Strapi CMS 基础地址，例如 https://api.do360.com
 * - cmsApiKey:      string   Strapi API Token
 * - couponEndpoint: string   优惠券系统后端地址
 * - emailEndpoint:  string   邮件服务后端地址
 * - getUser?: () => member   可选，自定义读取当前会员信息函数，默认从 Cookie 读取
 * - setUser?: (m) => void    可选，自定义写入当前会员信息函数，默认写回 Cookie
 */
const MemberPointMarket = ({
  cmsEndpoint,
  cmsApiKey,
  couponEndpoint,
  emailEndpoint,
  getUser = getCurrentMember,
  setUser = setCurrentMember,
}) => {
  // 当前用户（默认从 cookie 里读）
  const currUser = getUser() || {};

  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const [currDeduction, setCurrDeduction] = useState(0);
  const [loadingRedeem, setLoadingRedeem] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [redeemProduct, setRedeemProduct] = useState(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // 最大可抵扣（受商品 MaxDeduction & 商品价格 双重限制）
  const maxDeduction = useMemo(() => {
    if (!redeemProduct) return 0;
    const price = Number(redeemProduct.Price || 0);
    const max = Number(redeemProduct.MaxDeduction || 0);
    return Math.min(price, max);
  }, [redeemProduct]);


  // ===== 页面加载时自动同步最新积分 & 写 cookie =====
  useEffect(() => {
    async function refreshMemberBalance() {
      const user = getUser() || {};
      if (!cmsEndpoint || !cmsApiKey) return;
      if (!user.number) return; // 未登录不查

      try {
        const qs = new URLSearchParams();
        qs.append("filters[MembershipNumber][$eq]", String(user.number));

        const url = `${cmsEndpoint}/api/one-club-memberships?${qs.toString()}`;
        const res = await fetch(url, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cmsApiKey}`,
          },
        });

        if (!res.ok) return;
        const json = await res.json();
        const record = json?.data?.[0];
        if (!record) return;

        // 生成更新后的 member 对象
        const refreshed = {
          ...user,
          points: Number(record.Point ?? user.points ?? 0),
          discount_point: Number(record.DiscountPoint ?? user.discount_point ?? 0),
          loyalty_point: Number(record.LoyaltyPoint ?? user.loyalty_point ?? 0),
        };

        // 更新 Cookie 供其它页面使用
        setUser(refreshed);

        // 也让界面立即使用最新余额（影响弹窗里的扣减提示显示）
        // ⚠️ currUser 是初始化常量，这里不可以直接修改，所以直接强制刷新页面
        // 但比 window.reload() 优雅——只更新列表等不相关 UI
        console.log("[MemberPointMarket] refreshed member balance from server");
      } catch (err) {
        console.error("[MemberPointMarket] refreshMemberBalance error:", err);
      }
    }

    refreshMemberBalance();
  }, [cmsEndpoint, cmsApiKey]);

  // ===== 拉取商品列表 =====
  useEffect(() => {
    if (!currUser || !currUser.number) return;
    if (!cmsEndpoint || !cmsApiKey) {
      console.error(
        "[MemberPointMarket] Missing cmsEndpoint or cmsApiKey, cannot load products."
      );
      return;
    }

    const fetchProducts = async () => {
      const qs = new URLSearchParams();
      qs.append("filters[MembershipNumber][$eq]", String(currUser.number));
      qs.append("populate[AllowedProduct][populate]", "*");

      const userProductUrl = `${cmsEndpoint}/api/one-club-memberships?${qs.toString()}`;
      const allProductUrl = `${cmsEndpoint}/api/one-club-products?filters[ForOneClub][$eq]=True&populate=*`;

      try {
        // 1) 尝试获取“当前会员专属商品”
        const response = await fetch(userProductUrl, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cmsApiKey}`,
          },
        });
        const userData = await response.json();

        let items = userData?.data?.[0]?.AllowedProduct || [];

        // 2) 如果没有专属商品，则 fallback 到公共商品
        if (!items || items.length === 0) {
          const allResponse = await fetch(allProductUrl, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${cmsApiKey}`,
            },
          });
          const allData = await allResponse.json();
          items = allData.data || [];
        }

        // 3) 按 Order 排序
        items.sort((a, b) => (a.Order || 0) - (b.Order || 0));

        setProducts(items);
      } catch (error) {
        console.error("Error fetching products:", error);
      }
    };

    fetchProducts();
  }, [cmsApiKey, cmsEndpoint, currUser?.number]);

  // ===== 搜索过滤 =====
  const filteredProducts = products.filter((product) => {
    const name = (product.Name || "").toLowerCase();
    return name.includes(searchTerm.toLowerCase());
  });

  // ===== 弹窗 & 交互处理 =====
  const handleCardClick = (product) => {
    setSelectedProduct(product);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedProduct(null);
  };

  const handleRedeemClick = (product, e) => {
    if (e) e.stopPropagation();
    setShowModal(false);
    setRedeemProduct(product);
    setCurrDeduction(0);
    setShowConfirmModal(true);
  };

  const handleDeductionChange = (value) => {
    let newValue = Number(value);
    if (Number.isNaN(newValue)) newValue = 0;

    if (newValue > maxDeduction) {
      alert(`最大抵扣 ${maxDeduction}`);
      newValue = maxDeduction;
    }
    if (newValue < 0) newValue = 0;
    setCurrDeduction(newValue);
  };

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    // 刷新页面以同步最新积分 & 商品状态
    window.location.reload();
  };

  // ===== 更新用户积分 & MyCoupon 关联 =====
  const updateUserPoint = async (cid) => {
    const latestUser = getUser() || {};
    if (!latestUser.number || !latestUser.email) {
      console.error(
        "[MemberPointMarket] Cannot update user points: missing number or email."
      );
      return;
    }
    if (!cmsEndpoint || !cmsApiKey) {
      console.error(
        "[MemberPointMarket] Missing cmsEndpoint/cmsApiKey in updateUserPoint."
      );
      return;
    }

    const userQueryUrl = `${cmsEndpoint}/api/one-club-memberships?filters[MembershipNumber][$eq]=${latestUser.number}&filters[Email][$eq]=${latestUser.email}&populate=MyCoupon`;

    try {
      const userResponse = await fetch(userQueryUrl, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cmsApiKey}`,
        },
      });
      const userData = await userResponse.json();

      if (userResponse.ok && userData.data && userData.data.length > 0) {
        const userRecord = userData.data[0];
        const documentId = userRecord.documentId;
        const oldPoint = Number(userRecord.Point || 0);
        const oldDiscountPoint = Number(userRecord.DiscountPoint || 0);

        const productPrice = Number(redeemProduct?.Price || 0);
        const usedDiscount = Number(currDeduction || 0);

        const newPoint = oldPoint - (productPrice - usedDiscount);
        const newDiscountPoint = oldDiscountPoint - usedDiscount;

        // 当前已关联的券（documentId 数组）
        const existingCoupons =
          userRecord.MyCoupon?.map((c) => c.documentId) ?? [];
        const updatedCoupons = [...new Set([...existingCoupons, cid])];

        const updatePayload = {
          data: {
            Point: newPoint,
            DiscountPoint: newDiscountPoint,
            MyCoupon: updatedCoupons, // 保持与原 1club-website 相同的写法
          },
        };

        const updateResponse = await fetch(
          `${cmsEndpoint}/api/one-club-memberships/${documentId}`,
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
          const updateError = await updateResponse.json();
          console.log("Error updating user info:", updateError.message);
        } else {
          console.log("[MemberPointMarket] User points updated successfully.");
        }

        // 更新前端的用户信息（写回 cookie）
        const updatedUser = {
          ...latestUser,
          points: newPoint,
          discount_point: newDiscountPoint,
        };
        setUser(updatedUser);
      } else {
        console.error(
          "[MemberPointMarket] User not found or error fetching user data."
        );
      }
    } catch (error) {
      console.error("[MemberPointMarket] Error updating user info:", error);
    }
  };

  // ===== 真正“兑换”的主流程 =====
  const confirmRedeemNow = async () => {
    const latestUser = getUser() || {};
    if (!latestUser.name || !latestUser.email) {
      alert("未找到当前登录会员信息，请重新登录后再试。");
      return;
    }
    if (!couponEndpoint || !emailEndpoint) {
      console.error(
        "[MemberPointMarket] Missing couponEndpoint/emailEndpoint in confirmRedeemNow."
      );
      alert("系统配置错误，请稍后再试或联系我们。");
      return;
    }

    setLoadingRedeem(true);

    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    // 安全地获取 Provider 名称：兼容多种 Strapi 结构
    const providerName =
      redeemProduct?.Provider?.data?.attributes?.Name ??
      redeemProduct?.Provider?.Name ??
      "1club";

    const couponPayload = {
      title: redeemProduct.Name,
      description: redeemProduct.Description,
      expiry: expiryDate.toISOString(),
      assigned_from: providerName,
      assigned_to: latestUser.name,
      value: Number(redeemProduct.Price || 0) - Number(currDeduction || 0),
    };

    try {
      // 1) 向优惠券系统创建 active 券
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

        // 2) 向邮件服务发送券邮件
        const emailPayload = {
          name: latestUser.name,
          email: latestUser.email,
          data: QRdata,
          title: redeemProduct.Name,
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
          // 3) 券发出成功之后，更新积分 & 会员关联券
          await updateUserPoint(couponData.cid);
          console.log("[MemberPointMarket] Redeemed successfully.");
          setLoadingRedeem(false);
          setCurrDeduction(0);
          setShowConfirmModal(false);
          setShowSuccessModal(true);
        } else {
          const emailError = await emailResponse.json();
          console.error("[MemberPointMarket] Email API error:", emailError);
          setLoadingRedeem(false);
          setCurrDeduction(0);
          alert("兑换成功但邮件发送失败，请联系客服手动处理优惠券。");
        }
      } else {
        console.error(
          "[MemberPointMarket] Coupon system error:",
          couponData.message
        );
        setLoadingRedeem(false);
        setCurrDeduction(0);
        alert("兑换失败，优惠券系统出现问题，请稍后重试。");
      }
    } catch (error) {
      console.error("[MemberPointMarket] Error in confirmRedeemNow():", error);
      setLoadingRedeem(false);
      setCurrDeduction(0);
      alert("兑换失败，请检查网络或稍后再试。");
    }
  };

  // ===== JSX 渲染部分 =====
  return (
    <Container className="my-4">
      <Row>
        <Col>
          <h2>会员商城 / Member&apos;s Market</h2>
        </Col>
        <Col>
          <Form className="mb-3">
            <Form.Control
              type="text"
              placeholder="搜索 / Search ..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </Form>
        </Col>
      </Row>

      {/* 商品列表 */}
      <Row>
        {filteredProducts.map((product) => {
          const { Name, Icon, Price, MaxDeduction } = product;
          const iconUrl = Icon?.url ? `${cmsEndpoint}${Icon.url}` : "";

          return (
            <Col md={4} key={product.id} className="mb-4">
              <Card>
                <Card.Body
                  onClick={() => handleCardClick(product)}
                  style={{ cursor: "pointer" }}
                >
                  <Card.Title className="product-card-title">
                    {Name}
                  </Card.Title>
                  {iconUrl && (
                    <Card.Img
                      variant="top"
                      src={iconUrl}
                      alt={Name}
                      className="mb-3"
                      style={{ objectFit: "cover", height: "200px" }}
                    />
                  )}
                  <Row className="text-center d-flex">
                    <Col>
                      <AlternatingText
                        text1={`${Price} 现金`}
                        text2={`360币最高抵扣${Math.min(
                          Number(Price || 0),
                          Number(MaxDeduction || 0)
                        )}！`}
                        judge={MaxDeduction}
                      />
                    </Col>
                  </Row>
                </Card.Body>
                <Card.Footer>
                  <Button
                    variant="dark"
                    className="w-100"
                    onClick={(e) => handleRedeemClick(product, e)}
                  >
                    现在兑换
                  </Button>
                </Card.Footer>
              </Card>
            </Col>
          );
        })}
      </Row>

      {/* 商品详情弹窗 */}
      {selectedProduct && (
        <Modal show={showModal} onHide={handleModalClose}>
          <Modal.Header closeButton>
            <Modal.Title>{selectedProduct.Name}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            {selectedProduct.Icon?.url && (
              <img
                src={`${cmsEndpoint}${selectedProduct.Icon.url}`}
                alt={selectedProduct.Name}
                className="img-fluid mb-3"
              />
            )}
            <p>{selectedProduct.Description}</p>
            <Row className="text-center">
              <Col>
                <div>{selectedProduct.Price} 现金</div>
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="dark"
              className="w-100"
              onClick={(e) => handleRedeemClick(selectedProduct, e)}
            >
              现在兑换
            </Button>
          </Modal.Footer>
        </Modal>
      )}

      {/* 兑换确认弹窗 */}
      {redeemProduct && (
        <Modal
          show={showConfirmModal}
          onHide={() => {
            setShowConfirmModal(false);
            setRedeemProduct(null);
            setCurrDeduction(0);
          }}
        >
          <Modal.Header closeButton>
            <Modal.Title>确认兑换</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>商品：{redeemProduct.Name}</p>
            {(() => {
              const userData = getUser() || {};
              const cookiePoint = Number(userData.points || 0);
              const cookieDiscountPoint = Number(userData.discount_point || 0);

              const finalCash =
                Number(redeemProduct.Price || 0) - Number(currDeduction || 0);
              const finalPoint =
                cookiePoint - Number(redeemProduct.Price || 0) + Number(currDeduction || 0);
              const finalDiscount = cookieDiscountPoint - Number(currDeduction || 0);

              return (
                <>
                  <p>
                    现金：{finalCash} → 兑换后余额{" "}
                    <b>{finalPoint}</b>
                  </p>
                  <p>
                    360币：{currDeduction} → 兑换后余额{" "}
                    <b>{finalDiscount}</b>{" "}
                    <b style={{ color: "SlateBlue" }}> </b>
                  </p>
                  <hr />
                  {maxDeduction > 0 && (
                    <Form.Group>
                      <Row className="d-flex">
                        <Col md={7}>
                          <Form.Label>
                            点数抵扣 ({currDeduction}/{maxDeduction})
                          </Form.Label>
                        </Col>
                        <Col md={5}>
                          <Row>
                            <InputGroup>
                              <Form.Control
                                type="number"
                                value={currDeduction}
                                onChange={(e) =>
                                  handleDeductionChange(e.target.value)
                                }
                              />
                              <Button
                                variant="dark"
                                onClick={() =>
                                  handleDeductionChange(
                                    Math.min(maxDeduction, cookieDiscountPoint)
                                  )
                                }
                              >
                                Max
                              </Button>
                            </InputGroup>
                          </Row>
                        </Col>
                      </Row>
                      <Form.Control
                        type="range"
                        min="0"
                        max={maxDeduction}
                        value={currDeduction}
                        onChange={(e) => handleDeductionChange(e.target.value)}
                        className="deduction-range"
                      />
                    </Form.Group>
                  )}
                </>
              );
            })()}
            <p>注：兑换成功后的核销券有效期为一年，请注意哦！</p>
          </Modal.Body>
          <Modal.Footer>
            {(() => {
              const userData = getUser() || {};
              const cookiePoint = Number(userData.points || 0);
              const cookieDiscountPoint = Number(userData.discount_point || 0);

              const needCash =
                Number(redeemProduct.Price || 0) - Number(currDeduction || 0);

              const sufficientPoint = cookiePoint >= needCash;
              const sufficientDiscountPoint =
                cookieDiscountPoint - Number(currDeduction || 0) >= 0;
              const canRedeem = sufficientPoint && sufficientDiscountPoint;

              return (
                <Button
                  variant={canRedeem ? "dark" : "secondary"}
                  className="w-100"
                  disabled={!canRedeem || loadingRedeem}
                  onClick={confirmRedeemNow}
                >
                  {canRedeem
                    ? loadingRedeem
                      ? "正在为您兑换.."
                      : "兑换"
                    : sufficientPoint
                    ? "360币不足"
                    : "现金不足"}
                </Button>
              );
            })()}
          </Modal.Footer>
        </Modal>
      )}

      {/* 兑换成功弹窗 */}
      {redeemProduct && showSuccessModal && (
        <Modal show={showSuccessModal} onHide={closeSuccessModal} centered>
          <Modal.Header closeButton>
            <Modal.Title>{redeemProduct.Name}</Modal.Title>
          </Modal.Header>
          <Modal.Body className="text-center">
            <i
              className="bi bi-check-circle"
              style={{ fontSize: "3rem", color: "green" }}
            ></i>
            <p className="mt-3">
              兑换成功，我们已将优惠券发送至您的邮箱。
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="dark"
              className="w-100"
              onClick={closeSuccessModal}
            >
              确定
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </Container>
  );
};

export default MemberPointMarket;
