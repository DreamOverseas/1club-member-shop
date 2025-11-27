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
 * @param {object} props
 * @param {string} props.cmsEndpoint      - Strapi CMS 基础地址，例如 https://cms.xxx.com
 * @param {string} props.cmsApiKey        - Strapi API Token
 * @param {string} props.couponEndpoint   - 优惠券系统后端地址
 * @param {string} props.emailEndpoint    - 邮件服务后端地址
 * @param {function} [props.getUser]      - 可选，自定义读取当前会员信息函数，默认从 Cookie 读取
 * @param {function} [props.setUser]      - 可选，自定义写入当前会员信息函数，默认写回 Cookie
 */
const MemberPointMarket = ({
  cmsEndpoint,
  cmsApiKey,
  couponEndpoint,
  emailEndpoint,
  getUser = getCurrentMember,
  setUser = setCurrentMember,
}) => {
  // 当前用户（从 getUser 读取一次）
  const currUser = getUser() || {};

  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const [currDeduction, setCurrDeduction] = useState(0);
  const [loadingRedeem, setLoadingRedeem] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [redeemProduct, setRedeemProduct] = useState(null);
  const maxDeduction = useMemo(() => {
    return redeemProduct
      ? Math.min(redeemProduct.MaxDeduction, redeemProduct.Price)
      : 0;
  }, [redeemProduct]);

  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // 拉取商品列表
  useEffect(() => {
    if (!currUser || !currUser.number) return;

    const fetchProducts = async () => {
      const qs = new URLSearchParams();
      qs.append("filters[MembershipNumber][$eq]", String(currUser.number));
      qs.append("populate[AllowedProduct][populate]", "*");

      const user_product_url = `${cmsEndpoint}/api/one-club-memberships?${qs.toString()}`;
      const all_product_url = `${cmsEndpoint}/api/one-club-products?filters[ForOneClub][$eq]=True&populate=*`;

      try {
        // 1) 尝试获取“当前会员专属商品”
        const response = await fetch(user_product_url, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cmsApiKey}`,
          },
        });
        const user_p_data = await response.json();

        let items = user_p_data?.data?.[0]?.AllowedProduct || [];

        // 2) 如果没有专属商品，则 fallback 到公共商品
        if (!items || items.length === 0) {
          const all_p_response = await fetch(all_product_url, {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${cmsApiKey}`,
            },
          });
          const all_p_data = await all_p_response.json();
          items = all_p_data.data || [];
        }

        // 3) 按 Order 排序
        items.sort((a, b) => a.Order - b.Order);

        setProducts(items);
      } catch (error) {
        console.error("Error fetching products:", error);
      }
    };

    fetchProducts();
  }, [cmsApiKey, cmsEndpoint, currUser?.number]);

  // 搜索过滤
  const filteredProducts = products.filter((product) =>
    product.Name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCardClick = (product) => {
    setSelectedProduct(product);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedProduct(null);
  };

  const handleRedeemClick = (product, e) => {
    e.stopPropagation();
    setShowModal(false);
    setRedeemProduct(product);
    setShowConfirmModal(true);
  };

  const handleDeductionChange = (value) => {
    let newValue = Number(value);
    if (newValue > maxDeduction) {
      alert(`最大抵扣 ${maxDeduction}`);
      newValue = maxDeduction;
    }
    if (newValue < 0) newValue = 0;
    setCurrDeduction(newValue);
  };

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    // 当前实现是直接刷新页面，同步积分 & 商品状态
    window.location.reload();
  };

  // 更新用户积分 & 已有优惠券
  const updateUserPoint = async (cid) => {
    const latestUser = getUser() || {};
    if (!latestUser.number || !latestUser.email) {
      console.error("Cannot update user points: missing number or email");
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
        const oldPoint = userRecord.Point;
        const oldDiscountPoint = userRecord.DiscountPoint;

        const productPrice = redeemProduct.Price;
        const usedDiscount = currDeduction;

        const newPoint = oldPoint - (productPrice - usedDiscount);
        const newDiscountPoint = oldDiscountPoint - usedDiscount;

        // get currently linked coupons and append new one
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
          console.log("Updated successfully");
        }

        // 更新前端的用户信息（默认写回 Cookie）
        const updatedUser = {
          ...latestUser,
          points: newPoint,
          discount_point: newDiscountPoint,
        };
        setUser(updatedUser);
      } else {
        console.error("User not found or error fetching user data");
      }
    } catch (error) {
      console.error("Error updating user info:", error);
    }
  };

  // 真正“兑换”的流程
  const comfirmRedeemNow = async () => {
    setLoadingRedeem(true);

    const latestUser = getUser() || {};
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    const couponPayload = {
      title: redeemProduct.Name,
      description: redeemProduct.Description,
      expiry: expiryDate.toISOString(),
      assigned_from: redeemProduct.Provider.Name,
      assigned_to: latestUser.name,
      value: redeemProduct.Price - currDeduction,
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
          // 3) 券发出成功之后，更新积分
          await updateUserPoint(couponData.cid);
          console.log("Redeemed.");
          setLoadingRedeem(false);
          setCurrDeduction(0);
          setShowConfirmModal(false);
          setShowSuccessModal(true);
        } else {
          const emailError = await emailResponse.json();
          console.error("Email API error:", emailError.message);
          setLoadingRedeem(false);
          setCurrDeduction(0);
        }
      } else {
        console.error("Coupon system error:", couponData.message);
        setLoadingRedeem(false);
        setCurrDeduction(0);
      }
    } catch (error) {
      console.error("Error in comfirmRedeemNow():", error);
      setLoadingRedeem(false);
      setCurrDeduction(0);
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
                          Price,
                          MaxDeduction
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
            {selectedProduct.Icon && selectedProduct.Icon.url && (
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
              const cookiePoint = userData.points || 0;
              const cookieDiscountPoint = userData.discount_point || 0;
              return (
                <>
                  <p>
                    现金：
                    {redeemProduct.Price - currDeduction} → 兑换后余额{" "}
                    <b>
                      {cookiePoint - redeemProduct.Price + currDeduction}
                    </b>
                  </p>
                  <p>
                    360币：{currDeduction} → 兑换后余额{" "}
                    <b>{cookieDiscountPoint - currDeduction}</b>{" "}
                    <b style={{ color: "SlateBlue" }}> </b>
                  </p>
                  <hr />
                  {maxDeduction > 0 ? (
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
                                    Math.min(
                                      maxDeduction,
                                      cookieDiscountPoint
                                    )
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
                        onChange={(e) =>
                          handleDeductionChange(e.target.value)
                        }
                        className="deduction-range"
                      />
                    </Form.Group>
                  ) : (
                    <></>
                  )}
                </>
              );
            })()}
            <p>注：兑换成功后的核销券有效期为一年，请注意哦！</p>
          </Modal.Body>
          <Modal.Footer>
            {(() => {
              const userData = getUser() || {};
              const cookiePoint = userData.points || 0;
              const cookieDiscountPoint = userData.discount_point || 0;
              const sufficientPoint =
                cookiePoint >= redeemProduct.Price - currDeduction;
              const sufficientDiscountPoint =
                cookieDiscountPoint - currDeduction >= 0;
              const canRedeem = sufficientPoint && sufficientDiscountPoint;
              return (
                <Button
                  variant={canRedeem ? "dark" : "secondary"}
                  className="w-100"
                  disabled={!canRedeem}
                  onClick={comfirmRedeemNow}
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
