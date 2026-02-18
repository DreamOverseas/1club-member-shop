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
  ListGroup,
  Image,
} from "react-bootstrap";

// 样式 & 小组件 & hooks
import "./styles/member-shop.css";
import AlternatingText from "./components/AlternatingText";
import { getCurrentMember, setCurrentMember } from "./hooks/useMemberAuth";

/**
 * 积分商城主组件
 *
 * props:
 * - cmsEndpoint:    string   Strapi CMS 基础地址
 * - cmsApiKey:      string   Strapi API Token
 * - couponEndpoint: string   优惠券系统后端地址
 * - emailEndpoint:  string   邮件服务后端地址
 * - getUser?: () => member   可选，自定义读取当前会员信息函数
 * - setUser?: (m) => void    可选，自定义写入当前会员信息函数
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

  // 兑换相关 State
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [redeemProduct, setRedeemProduct] = useState(null);
  const [currDeduction, setCurrDeduction] = useState(0);
  const [customPrice, setCustomPrice] = useState("");
  const [loadingRedeem, setLoadingRedeem] = useState(false);

  // 兑换结果 State (用于 Success Modal 展示)
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [redeemResult, setRedeemResult] = useState(null);

  // 计算当前生效的基础价格（固定价格 或 用户输入价格）
  const currentBasePrice = useMemo(() => {
    if (!redeemProduct) return 0;
    if (redeemProduct.Fixed) {
      return Number(customPrice) || 0;
    }
    return Number(redeemProduct.Price || 0);
  }, [redeemProduct, customPrice]);

  // 最大可抵扣（受商品 MaxDeduction & 当前基础价格 双重限制）
  const maxDeduction = useMemo(() => {
    if (!redeemProduct) return 0;
    const max = Number(redeemProduct.MaxDeduction || 0);
    return Math.min(currentBasePrice, max);
  }, [redeemProduct, currentBasePrice]);

  // ===== 页面加载时自动同步最新积分 & 写 cookie =====
  useEffect(() => {
    async function refreshMemberBalance() {
      const user = getUser() || {};
      if (!cmsEndpoint || !cmsApiKey) return;
      if (!user.number) return;

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

        const refreshed = {
          ...user,
          points: Number(record.Point ?? user.points ?? 0),
          discount_point: Number(
            record.DiscountPoint ?? user.discount_point ?? 0
          ),
          loyalty_point: Number(record.LoyaltyPoint ?? user.loyalty_point ?? 0),
        };

        setUser(refreshed);
        console.log("[MemberPointMarket] refreshed member balance from server");
      } catch (err) {
        console.error("[MemberPointMarket] refreshMemberBalance error:", err);
      }
    }

    refreshMemberBalance();
  }, [cmsEndpoint, cmsApiKey, getUser, setUser]);

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
        const response = await fetch(userProductUrl, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cmsApiKey}`,
          },
        });
        const userData = await response.json();
        let items = userData?.data?.[0]?.AllowedProduct || [];

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

    if (product.Fixed) {
      setCustomPrice("");
    } else {
      setCustomPrice(product.Price);
    }

    setCurrDeduction(0);
    setShowConfirmModal(true);
  };

  const handleDeductionChange = (value) => {
    let newValue = Number(value);
    if (Number.isNaN(newValue)) newValue = 0;

    if (newValue > maxDeduction) {
      newValue = maxDeduction;
    }
    if (newValue < 0) newValue = 0;
    setCurrDeduction(newValue);
  };

  const handleCustomPriceChange = (val) => {
    if (val === "") {
      setCustomPrice("");
      setCurrDeduction(0);
      return;
    }
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      setCustomPrice(num);
      if (currDeduction > num) {
        setCurrDeduction(0);
      }
    }
  };

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    setRedeemResult(null);
    // 刷新页面以同步最新积分
    window.location.reload();
  };

  // ===== 更新用户积分 =====
  const updateUserPoint = async (cid) => {
    const latestUser = getUser() || {};
    if (!latestUser.number || !latestUser.email) return;

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

        const productPrice = currentBasePrice;
        const usedDiscount = Number(currDeduction || 0);

        const newPoint = oldPoint - (productPrice - usedDiscount);
        const newDiscountPoint = oldDiscountPoint - usedDiscount;

        const existingCoupons =
          userRecord.MyCoupon?.map((c) => c.documentId) ?? [];
        const updatedCoupons = [...new Set([...existingCoupons, cid])];

        const updatePayload = {
          data: {
            Point: newPoint,
            DiscountPoint: newDiscountPoint,
            MyCoupon: updatedCoupons,
          },
        };

        await fetch(`${cmsEndpoint}/api/one-club-memberships/${documentId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cmsApiKey}`,
          },
          body: JSON.stringify(updatePayload),
        });

        const updatedUser = {
          ...latestUser,
          points: newPoint,
          discount_point: newDiscountPoint,
        };
        setUser(updatedUser);
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

    if (redeemProduct.Fixed && (!currentBasePrice || currentBasePrice <= 0)) {
      alert("请输入有效的金额");
      return;
    }

    setLoadingRedeem(true);

    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    const providerName =
      redeemProduct?.Provider?.data?.attributes?.Name ??
      redeemProduct?.Provider?.Name ??
      "1club";

    const finalValue = currentBasePrice - Number(currDeduction || 0);

    const couponPayload = {
      title: redeemProduct.Name,
      description: redeemProduct.Description,
      expiry: expiryDate.toISOString(),
      assigned_from: providerName,
      assigned_to: latestUser.name,
      value: finalValue,
    };

    try {
      // 1. 创建 Coupon
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

        // 2. 根据类型处理：Fixed(现场支付) vs 普通(邮件发送)
        if (redeemProduct.Fixed) {
          // Fixed 模式：跳过邮件，直接显示结果
          await updateUserPoint(couponData.cid);
          
          setRedeemResult({
            qrData: QRdata,
            amount: currentBasePrice,
            deduction: currDeduction,
            paid: finalValue,
            timestamp: new Date().toLocaleString(),
          });

          setLoadingRedeem(false);
          setCurrDeduction(0);
          setCustomPrice("");
          setShowConfirmModal(false);
          setShowSuccessModal(true);

        } else {
          // 普通模式：发送邮件
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
            await updateUserPoint(couponData.cid);
            setLoadingRedeem(false);
            setCurrDeduction(0);
            setCustomPrice("");
            setShowConfirmModal(false);
            setShowSuccessModal(true);
          } else {
            setLoadingRedeem(false);
            alert("兑换成功但邮件发送失败，请联系客服。");
          }
        }
      } else {
        setLoadingRedeem(false);
        alert("兑换失败，系统繁忙，请稍后重试。");
      }
    } catch (error) {
      console.error("[MemberPointMarket] Error:", error);
      setLoadingRedeem(false);
      alert("网络错误，请稍后再试。");
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
          const { Name, Icon, Price, MaxDeduction, Fixed } = product;
          const iconUrl = Icon?.url ? `${cmsEndpoint}${Icon.url}` : "";
          const priceDisplay = Fixed ? "自选金额" : `${Price} 现金`;

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
                        text1={priceDisplay}
                        text2={`360币最高抵扣${
                          Fixed
                            ? MaxDeduction || 0
                            : Math.min(
                                Number(Price || 0),
                                Number(MaxDeduction || 0)
                              )
                        }！`}
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

      {/* 商品详情 Modal */}
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
                <div>
                  {selectedProduct.Fixed
                    ? "自选金额"
                    : `${selectedProduct.Price} 现金`}
                </div>
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

      {/* 兑换确认/输入 Modal */}
      {redeemProduct && (
        <Modal
          show={showConfirmModal}
          onHide={() => {
            setShowConfirmModal(false);
            setRedeemProduct(null);
            setCurrDeduction(0);
            setCustomPrice("");
          }}
        >
          <Modal.Header closeButton>
            <Modal.Title>确认兑换</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <p>商品：{redeemProduct.Name}</p>

            {redeemProduct.Fixed && (
              <Form.Group className="mb-3">
                <Form.Label>请输入金额 (Enter Amount)</Form.Label>
                <InputGroup>
                  <InputGroup.Text>$</InputGroup.Text>
                  <Form.Control
                    type="number"
                    placeholder="0.00"
                    value={customPrice}
                    onChange={(e) => handleCustomPriceChange(e.target.value)}
                  />
                </InputGroup>
              </Form.Group>
            )}

            {(() => {
              const userData = getUser() || {};
              const cookiePoint = Number(userData.points || 0);
              const cookieDiscountPoint = Number(userData.discount_point || 0);

              const finalCash = currentBasePrice - Number(currDeduction || 0);
              const finalPoint =
                cookiePoint - currentBasePrice + Number(currDeduction || 0);
              const finalDiscount =
                cookieDiscountPoint - Number(currDeduction || 0);

              return (
                <>
                  <p>
                    现金：{finalCash} → 兑换后余额 <b>{finalPoint}</b>
                  </p>
                  <p>
                    360币：{currDeduction} → 兑换后余额 <b>{finalDiscount}</b>
                  </p>
                  <hr />
                  {maxDeduction > 0 && currentBasePrice > 0 && (
                    <Form.Group>
                      <Row className="d-flex align-items-center mb-2">
                        <Col md={7}>
                          <Form.Label className="m-0">
                            点数抵扣 ({currDeduction}/{maxDeduction})
                          </Form.Label>
                        </Col>
                        <Col md={5}>
                          <InputGroup size="sm">
                            <Form.Control
                              type="number"
                              value={currDeduction}
                              onChange={(e) =>
                                handleDeductionChange(e.target.value)
                              }
                            />
                            <Button
                              variant="outline-secondary"
                              onClick={() =>
                                handleDeductionChange(
                                  Math.min(maxDeduction, cookieDiscountPoint)
                                )
                              }
                            >
                              Max
                            </Button>
                          </InputGroup>
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
          </Modal.Body>
          <Modal.Footer>
            {(() => {
              const userData = getUser() || {};
              const cookiePoint = Number(userData.points || 0);
              const cookieDiscountPoint = Number(userData.discount_point || 0);
              const needCash = currentBasePrice - Number(currDeduction || 0);

              const sufficientPoint = cookiePoint >= needCash;
              const sufficientDiscountPoint =
                cookieDiscountPoint - Number(currDeduction || 0) >= 0;
              const validPrice = currentBasePrice > 0;
              const canRedeem =
                sufficientPoint && sufficientDiscountPoint && validPrice;

              let btnText = "兑换";
              if (loadingRedeem) btnText = "处理中...";
              else if (!validPrice) btnText = "请输入金额";
              else if (!sufficientPoint) btnText = "现金不足";
              else if (!sufficientDiscountPoint) btnText = "360币不足";

              return (
                <Button
                  variant={canRedeem ? "dark" : "secondary"}
                  className="w-100"
                  disabled={!canRedeem || loadingRedeem}
                  onClick={confirmRedeemNow}
                >
                  {btnText}
                </Button>
              );
            })()}
          </Modal.Footer>
        </Modal>
      )}

      {/* 兑换成功 Modal (包含 QR 和 详情) */}
      {redeemProduct && showSuccessModal && (
        <Modal show={showSuccessModal} onHide={closeSuccessModal} centered>
          <Modal.Header closeButton>
            <Modal.Title>{redeemProduct.Name}</Modal.Title>
          </Modal.Header>
          <Modal.Body className="text-center">
            {/* 区分显示：Fixed 显示 QR+详情；否则显示邮件提示 */}
            {redeemProduct.Fixed && redeemResult ? (
              <div>
                <div className="mb-3">
                  <h5 className="text-success">
                    请出示给工作人员扫码已确认付款
                  </h5>
                </div>
                
                {/* 动态生成二维码图片，不使用外部包 */}
                <div className="d-flex justify-content-center mb-3">
                  <Image
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                      redeemResult.qrData
                    )}`}
                    alt="Redemption QR Code"
                    thumbnail
                  />
                </div>
                
                <h4 className="mb-3" style={{ letterSpacing: "2px" }}>
                  {redeemResult.qrData}
                </h4>

                <Card className="text-start bg-light border-0">
                  <Card.Body>
                    <ListGroup variant="flush" className="bg-transparent">
                      <ListGroup.Item className="bg-transparent d-flex justify-content-between">
                        <span>总金额:</span>
                        <strong>${Number(redeemResult.amount).toFixed(2)}</strong>
                      </ListGroup.Item>
                      <ListGroup.Item className="bg-transparent d-flex justify-content-between">
                        <span>360币抵扣:</span>
                        <strong className="text-danger">
                          -${Number(redeemResult.deduction).toFixed(2)}
                        </strong>
                      </ListGroup.Item>
                      <ListGroup.Item className="bg-transparent d-flex justify-content-between border-top">
                        <span>实际支付:</span>
                        <strong>${Number(redeemResult.paid).toFixed(2)}</strong>
                      </ListGroup.Item>
                      <ListGroup.Item className="bg-transparent d-flex justify-content-between">
                        <small className="text-muted">时间:</small>
                        <small className="text-muted">
                          {redeemResult.timestamp}
                        </small>
                      </ListGroup.Item>
                    </ListGroup>
                  </Card.Body>
                </Card>
              </div>
            ) : (
              // 普通商品 (非 Fixed)
              <>
                <i
                  className="bi bi-check-circle"
                  style={{ fontSize: "3rem", color: "green" }}
                ></i>
                <p className="mt-3">
                  兑换成功，我们已将优惠券发送至您的邮箱。
                </p>
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="dark"
              className="w-100"
              onClick={closeSuccessModal}
            >
              关闭 / Close
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </Container>
  );
};

export default MemberPointMarket;