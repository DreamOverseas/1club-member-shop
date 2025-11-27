import React, { useState, useEffect, useMemo } from 'react';
import Cookies from 'js-cookie';
import { Container, Row, Col, Card, Button, Modal, Form, InputGroup } from 'react-bootstrap';
import '../Styles/MemberCenter.css';
import AlternatingText from './AlternatingText';

const MemberPointMarket = () => {
    const [products, setProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [showModal, setShowModal] = useState(false);

    const [currDeduction, setCurrDeduction] = useState(0);
    const [loadingRedeem, setLoadingRedeem] = useState(false);

    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [redeemProduct, setRedeemProduct] = useState(null);
    const maxDeduction = useMemo(() => {
        return redeemProduct ? Math.min(redeemProduct.MaxDeduction, redeemProduct.Price) : 0;
    }, [redeemProduct]); // Update based on existance of object redeemProduct

    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const endpoint = import.meta.env.VITE_CMS_API_ENDPOINT;
    const apiKey = import.meta.env.VITE_CMS_API_KEY;
    const currUser = JSON.parse(Cookies.get('user'));

    useEffect(() => {
        const fetchProducts = async () => {
            const qs = new URLSearchParams();
            qs.append('filters[MembershipNumber][$eq]', String(currUser.number));
            qs.append('populate[AllowedProduct][populate]', '*');

            const user_product_url = `${endpoint}/api/one-club-memberships?${qs.toString()}`;
            const all_product_url = `${endpoint}/api/one-club-products?filters[ForOneClub][$eq]=True&populate=*`;
            try {
                const response = await fetch(user_product_url, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    }
                });
                const user_p_data = await response.json();

                let items = user_p_data.data[0].AllowedProduct || [];

                if (items === undefined || items.length === 0) {
                    const all_p_response = await fetch(all_product_url, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${apiKey}`
                        }
                    });
                    const all_p_data = await all_p_response.json();
                    items = all_p_data.data || [];
                }

                items.sort((a, b) => a.Order - b.Order);

                setProducts(items);
            } catch (error) {
                console.error('Error fetching products:', error);
            }
        };

        fetchProducts();
    }, [apiKey, currUser.number, endpoint]);

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
        window.location.reload();
    };

    // Used for update user points (function break-up)
    const updateUserPoint = async (cid) => {

        const userQueryUrl = `${endpoint}/api/one-club-memberships?filters[MembershipNumber][$eq]=${currUser.number}&filters[Email][$eq]=${currUser.email}&populate=MyCoupon`;

        try {
            const userResponse = await fetch(userQueryUrl, {
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`
                }
            });
            const userData = await userResponse.json();

            if (userResponse.ok && userData.data && userData.data.length > 0) {
                const userRecord = userData.data[0];
                const documentId = userRecord.documentId;
                const oldPoint = userRecord.Point;
                const oldDiscountPoint = userRecord.DiscountPoint;

                const newPoint = oldPoint - (redeemProduct.Price - currDeduction);
                const newDiscountPoint = oldDiscountPoint - currDeduction;

                // get currently linked coupons and append new one
                const existingCoupons = userRecord.MyCoupon?.map((c) => c.documentId) ?? [];
                const updatedCoupons = [...new Set([...existingCoupons, cid])];

                const updatePayload = {
                    data: {
                        Point: newPoint,
                        DiscountPoint: newDiscountPoint,
                        MyCoupon: updatedCoupons,
                    }
                };

                const updateResponse = await fetch(`${endpoint}/api/one-club-memberships/${documentId}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(updatePayload)
                });

                if (updateResponse.ok) {
                    console.log("Updated successfully");
                } else {
                    const updateError = await updateResponse.json();
                    console.log("Error updating user info:", updateError.message);
                }

                // Update Cookie
                Cookies.set('user', JSON.stringify({
                    "name": currUser.name,
                    "number": currUser.number,
                    "email": currUser.email,
                    "class": currUser.class,
                    "exp": currUser.exp,
                    "points": newPoint,
                    "discount_point": newDiscountPoint,
                    "loyalty_point": currUser.loyalty_point,
                }), { expires: 7 });
            } else {
                console.error("User not found or error fetching user data");
            }
        } catch (error) {
            console.error("Error updating user info:", error);
        }
    }

    const comfirmRedeemNow = async () => {
        setLoadingRedeem(true);
        const currUser = JSON.parse(Cookies.get('user'));
        const couponSysEndpoint = import.meta.env.VITE_COUPON_SYS_ENDPOINT;
        const expiryDate = new Date();
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);

        const couponPayload = {
            title: redeemProduct.Name,
            description: redeemProduct.Description,
            expiry: expiryDate.toISOString(),
            assigned_from: redeemProduct.Provider.Name,
            assigned_to: currUser.name,
            value: redeemProduct.Price - currDeduction,
        };

        try {
            const couponResponse = await fetch(`${couponSysEndpoint}/create-active-coupon`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(couponPayload),
                mode: 'cors',
                credentials: 'include'
            });
            const couponData = await couponResponse.json();

            if (couponResponse.ok && couponData.couponStatus === "active") {
                const QRdata = couponData.QRdata;
                const emailApiEndpoint = import.meta.env.VITE_EMAIL_API_ENDPOINT;
                const emailPayload = {
                    name: currUser.name,
                    email: currUser.email,
                    data: QRdata,
                    title: redeemProduct.Name
                };

                const emailResponse = await fetch(`${emailApiEndpoint}/1club/coupon_distribute`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(emailPayload),
                    mode: 'cors',
                    credentials: 'include'
                });

                if (emailResponse.ok) {
                    updateUserPoint(couponData.cid);
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


    return (
        <Container className="my-4">
            <Row>
                <Col>
                    <h2>会员商城 / Member's Market</h2>
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
                    const iconUrl =
                        Icon?.url
                            ? `${endpoint}${Icon.url}`
                            : '';

                    return (
                        <Col md={4} key={product.id} className="mb-4">
                            <Card>
                                <Card.Body onClick={() => handleCardClick(product)} style={{ cursor: 'pointer' }}>
                                    <Card.Title className='product-card-title'>{Name}</Card.Title>
                                    {iconUrl && (
                                        <Card.Img
                                            variant="top"
                                            src={iconUrl}
                                            alt={Name}
                                            className="mb-3"
                                            style={{ objectFit: 'cover', height: '200px' }}
                                        />
                                    )}
                                    <Row className="text-center d-flex">
                                        <Col>
                                            <AlternatingText
                                                text1={`${Price} 现金`}
                                                text2={`360币最高抵扣${Math.min(Price, MaxDeduction)}！`}
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

            {selectedProduct && (
                <Modal show={showModal} onHide={handleModalClose}>
                    <Modal.Header closeButton>
                        <Modal.Title>{selectedProduct.Name}</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        {selectedProduct.Icon &&
                            selectedProduct.Icon &&
                            selectedProduct.Icon && (
                                <img
                                    src={`${endpoint}${selectedProduct.Icon.url}`}
                                    alt={selectedProduct.Name}
                                    className="img-fluid mb-3"
                                />
                            )}
                        <p>{selectedProduct.Description}</p>
                        <Row className="text-center">
                            <Col>
                                <div>
                                    {selectedProduct.Price} 现金
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
                            const userData = JSON.parse(Cookies.get('user'));
                            const cookiePoint = userData.points || 0;
                            const cookieDiscountPoint = userData.discount_point || 0;
                            return (
                                <>
                                    <p>
                                        现金：{redeemProduct.Price - currDeduction} → 兑换后余额 <b>{cookiePoint - redeemProduct.Price + currDeduction}</b>
                                    </p>
                                    <p>
                                        360币：{currDeduction} → 兑换后余额 <b>{cookieDiscountPoint - currDeduction}</b> <b style={{ color: 'SlateBlue' }}> </b>
                                    </p>
                                    <hr />
                                    {maxDeduction > 0 ?
                                        (<Form.Group>
                                            <Row className='d-flex'>
                                                <Col md={7}>
                                                    <Form.Label>点数抵扣 ({currDeduction}/{maxDeduction})</Form.Label>
                                                </Col>
                                                <Col md={5}>
                                                    <Row>
                                                        <InputGroup>
                                                            <Form.Control
                                                                type="number"
                                                                value={currDeduction}
                                                                onChange={(e) => handleDeductionChange(e.target.value)}
                                                            />
                                                            <Button
                                                                variant="dark"
                                                                onClick={() => handleDeductionChange(Math.min(maxDeduction, cookieDiscountPoint))}
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
                                        </Form.Group>)
                                        : (<></>)
                                    }
                                </>
                            );
                        })()}
                        <p>注：兑换成功后的核销券有效期为一年，请注意哦！</p>
                    </Modal.Body>
                    <Modal.Footer>
                        {(() => {
                            const cookiePoint = JSON.parse(Cookies.get('user')).points || 0;
                            const cookieDiscountPoint = JSON.parse(Cookies.get('user')).discount_point || 0;
                            const sufficientPoint = cookiePoint >= (redeemProduct.Price - currDeduction);
                            const sufficientDiscountPoint = (cookieDiscountPoint - currDeduction) >= 0;
                            return (
                                <Button
                                    variant={(sufficientPoint && sufficientDiscountPoint) ? "dark" : "secondary"}
                                    className="w-100"
                                    disabled={!(sufficientPoint && sufficientDiscountPoint)}
                                    onClick={comfirmRedeemNow}
                                >
                                    {(sufficientPoint && sufficientDiscountPoint) ?
                                        (loadingRedeem ? "正在为您兑换.." : "兑换")
                                        :
                                        (sufficientPoint ? "360币不足" : "现金不足")}
                                </Button>
                            );
                        })()}
                    </Modal.Footer>
                </Modal>
            )}

            {redeemProduct && showSuccessModal && (
                <Modal
                    show={showSuccessModal}
                    onHide={() => closeSuccessModal()}
                    centered
                >
                    <Modal.Header closeButton>
                        <Modal.Title>{redeemProduct.Name}</Modal.Title>
                    </Modal.Header>
                    <Modal.Body className="text-center">
                        <i className="bi bi-check-circle" style={{ fontSize: '3rem', color: 'green' }}></i>
                        <p className="mt-3">兑换成功，我们已将优惠券发送至您的邮箱。</p>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button
                            variant="dark"
                            className="w-100"
                            onClick={() => closeSuccessModal()}
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
