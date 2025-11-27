// 1club-member-shop/src/MemberProfileCard.jsx
import React, { useState } from "react";
import {
  Card,
  Row,
  Col,
  Button,
  Modal,
  Form,
  Alert,
  InputGroup,
  Spinner,
} from "react-bootstrap";
import Cookies from "js-cookie";

const formatNumber = (v) =>
  typeof v === "number"
    ? v.toLocaleString("en-AU")
    : v !== undefined && v !== null
    ? String(v)
    : "—";

/**
 * MemberProfileCard
 * props:
 * - member: { name, number, email, class, exp, points, discount_point, loyalty_point, ... }
 * - cmsEndpoint: string (如 https://api.do360.com)
 * - cmsApiKey: string   (Strapi token)
 */
export default function MemberProfileCard({ member, cmsEndpoint, cmsApiKey }) {
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [pwdError, setPwdError] = useState("");
  const [pwdSuccess, setPwdSuccess] = useState("");
  const [pwdLoading, setPwdLoading] = useState(false);
  const [showPwd1, setShowPwd1] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [showPwd3, setShowPwd3] = useState(false);

  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneForm, setPhoneForm] = useState({ phone: "" });
  const [phoneError, setPhoneError] = useState("");
  const [phoneSuccess, setPhoneSuccess] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);

  if (!member) return null;

  const handleLogout = () => {
    Cookies.remove("user");
    Cookies.remove("authToken");
    window.location.reload();
  };

  const openChangePassword = () => {
    setPwdForm({ current: "", next: "", confirm: "" });
    setPwdError("");
    setPwdSuccess("");
    setShowPwdModal(true);
  };

  const openUpdatePhone = () => {
    setPhoneForm({ phone: "" });
    setPhoneError("");
    setPhoneSuccess("");
    setShowPhoneModal(true);
  };

  // === 工具函数：根据 member 查 Strapi 记录 ===
  const fetchMemberRecord = async () => {
    const url =
      `${cmsEndpoint}/api/one-club-memberships` +
      `?filters[MembershipNumber][$eq]=${encodeURIComponent(member.number)}` +
      `&filters[Email][$eq]=${encodeURIComponent(
        (member.email || "").toLowerCase()
      )}`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${cmsApiKey}`,
      },
    });

    if (!res.ok) {
      throw new Error("无法获取会员资料");
    }
    const json = await res.json();
    const record = json.data?.[0];
    if (!record) throw new Error("未找到会员记录");
    return record;
  };

  // === 提交修改密码 ===
  const handleSubmitPassword = async (e) => {
    e.preventDefault();
    setPwdError("");
    setPwdSuccess("");

    if (!pwdForm.current || !pwdForm.next || !pwdForm.confirm) {
      setPwdError("请完整填写所有密码字段。");
      return;
    }
    if (pwdForm.next.length < 8) {
      setPwdError("新密码长度不能少于 8 个字符。");
      return;
    }
    if (pwdForm.next !== pwdForm.confirm) {
      setPwdError("两次输入的新密码不一致。");
      return;
    }

    setPwdLoading(true);
    try {
      // 1) 校验当前密码
      const verifyRes = await fetch(
        `${cmsEndpoint}/api/one-club-memberships/verify-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cmsApiKey}`,
          },
          body: JSON.stringify({
            membershipNumber: member.number,
            password: pwdForm.current,
          }),
        }
      );

      if (!verifyRes.ok) {
        if (verifyRes.status === 401) {
          setPwdError("当前密码错误，请重试。");
        } else {
          setPwdError("密码验证失败，请稍后重试。");
        }
        setPwdLoading(false);
        return;
      }

      // 2) 查记录拿 documentId
      const record = await fetchMemberRecord();
      const documentId = record.documentId;

      // 3) 更新密码
      const updateRes = await fetch(
        `${cmsEndpoint}/api/one-club-memberships/${documentId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cmsApiKey}`,
          },
          body: JSON.stringify({
            data: { Password: pwdForm.next },
          }),
        }
      );

      if (!updateRes.ok) {
        const errJson = await updateRes.json().catch(() => ({}));
        console.error("密码更新失败：", errJson);
        setPwdError("更新密码失败，请稍后重试。");
        setPwdLoading(false);
        return;
      }

      setPwdSuccess("密码已成功更新，下次登录请使用新密码。");
      setPwdLoading(false);
    } catch (err) {
      console.error("handleSubmitPassword error:", err);
      setPwdError("服务器异常，请稍后重试。");
      setPwdLoading(false);
    }
  };

  // === 提交修改电话 ===
  const handleSubmitPhone = async (e) => {
    e.preventDefault();
    setPhoneError("");
    setPhoneSuccess("");

    const phone = phoneForm.phone.trim();
    if (!phone) {
      setPhoneError("请输入新的联系电话。");
      return;
    }
    if (phone.length < 4) {
      setPhoneError("电话号码长度看起来不太对，请检查后重试。");
      return;
    }

    setPhoneLoading(true);
    try {
      const record = await fetchMemberRecord();
      const documentId = record.documentId;

      const updateRes = await fetch(
        `${cmsEndpoint}/api/one-club-memberships/${documentId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cmsApiKey}`,
          },
          body: JSON.stringify({
            data: { Phone: phone },
          }),
        }
      );

      if (!updateRes.ok) {
        const errJson = await updateRes.json().catch(() => ({}));
        console.error("电话更新失败：", errJson);
        setPhoneError("更新电话失败，请稍后重试。");
        setPhoneLoading(false);
        return;
      }

      setPhoneSuccess("联系电话已更新。");
      setPhoneLoading(false);
    } catch (err) {
      console.error("handleSubmitPhone error:", err);
      setPhoneError("服务器异常，请稍后重试。");
      setPhoneLoading(false);
    }
  };

  return (
    <>
      {/* 顶部会员信息卡片 */}
      <Card className="mb-4 shadow-sm">
        <Card.Body>
          <Row>
            <Col md={6}>
              <Row className="mb-2">
                <Col xs={4}>名字</Col>
                <Col xs={8} className="text-end">
                  {member.name || "—"}
                </Col>
              </Row>
              <Row className="mb-2">
                <Col xs={4}>会员号</Col>
                <Col xs={8} className="text-end">
                  {member.number || "—"}
                </Col>
              </Row>
              <Row className="mb-2">
                <Col xs={4}>邮箱</Col>
                <Col xs={8} className="text-end">
                  {member.email || "—"}
                </Col>
              </Row>
              <Row className="mb-2">
                <Col xs={4}>会员等级</Col>
                <Col xs={8} className="text-end fw-bold">
                  {member.class || "—"}
                </Col>
              </Row>
              <Row className="mb-2">
                <Col xs={4}>到期日</Col>
                <Col xs={8} className="text-end">
                  {member.exp || "—"}
                </Col>
              </Row>
            </Col>

            <Col md={6}>
              <Row className="mb-2">
                <Col xs={4}>现金</Col>
                <Col xs={8} className="text-end">
                  {formatNumber(member.points)}
                </Col>
              </Row>
              <Row className="mb-2">
                <Col xs={4}>360币 🪙</Col>
                <Col xs={8} className="text-end">
                  {formatNumber(member.discount_point)}
                </Col>
              </Row>
              <Row className="mb-2">
                <Col xs={4}>积分</Col>
                <Col xs={8} className="text-end">
                  {formatNumber(member.loyalty_point)}
                </Col>
              </Row>
              <Row className="mb-2">
                <Col xs={4}>券面价值</Col>
                <Col xs={8} className="text-end">
                  {member.coupon_value
                    ? formatNumber(member.coupon_value)
                    : "—"}
                </Col>
              </Row>
              <Row className="mb-2">
                <Col xs={4}>总价值</Col>
                <Col xs={8} className="text-end">
                  {member.total_value
                    ? formatNumber(member.total_value)
                    : "—"}
                </Col>
              </Row>
              <Row className="mb-2">
                <Col xs={4}>当前状态</Col>
                <Col xs={8} className="text-end">
                  {member.status || "活跃"}
                </Col>
              </Row>
            </Col>
          </Row>

          <div className="mt-3 text-center">
            <Button
              variant="danger"
              className="me-2"
              size="sm"
              onClick={handleLogout}
            >
              登出
            </Button>
            <Button
              variant="warning"
              className="me-2"
              size="sm"
              onClick={openChangePassword}
            >
              更新密码
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={openUpdatePhone}
            >
              更新电话
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* 修改密码弹窗 */}
      <Modal
        show={showPwdModal}
        onHide={() => setShowPwdModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>修改密码</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {pwdError && <Alert variant="danger">{pwdError}</Alert>}
          {pwdSuccess && <Alert variant="success">{pwdSuccess}</Alert>}

          <Form onSubmit={handleSubmitPassword}>
            <Form.Group controlId="pwd-current" className="mb-3">
              <Form.Label>当前密码</Form.Label>
              <InputGroup>
                <Form.Control
                  type={showPwd1 ? "text" : "password"}
                  value={pwdForm.current}
                  onChange={(e) =>
                    setPwdForm({ ...pwdForm, current: e.target.value })
                  }
                  required
                />
                <InputGroup.Text
                  onClick={() => setShowPwd1((v) => !v)}
                  style={{ cursor: "pointer" }}
                >
                  <i className={showPwd1 ? "bi bi-eye-fill" : "bi bi-eye"} />
                </InputGroup.Text>
              </InputGroup>
            </Form.Group>

            <Form.Group controlId="pwd-next" className="mb-3">
              <Form.Label>新密码</Form.Label>
              <InputGroup>
                <Form.Control
                  type={showPwd2 ? "text" : "password"}
                  value={pwdForm.next}
                  onChange={(e) =>
                    setPwdForm({ ...pwdForm, next: e.target.value })
                  }
                  required
                />
                <InputGroup.Text
                  onClick={() => setShowPwd2((v) => !v)}
                  style={{ cursor: "pointer" }}
                >
                  <i className={showPwd2 ? "bi bi-eye-fill" : "bi bi-eye"} />
                </InputGroup.Text>
              </InputGroup>
              <Form.Text muted>
                密码不少于 8 个字符，建议数字和字母结合。
              </Form.Text>
            </Form.Group>

            <Form.Group controlId="pwd-confirm" className="mb-3">
              <Form.Label>确认新密码</Form.Label>
              <InputGroup>
                <Form.Control
                  type={showPwd3 ? "text" : "password"}
                  value={pwdForm.confirm}
                  onChange={(e) =>
                    setPwdForm({ ...pwdForm, confirm: e.target.value })
                  }
                  required
                />
                <InputGroup.Text
                  onClick={() => setShowPwd3((v) => !v)}
                  style={{ cursor: "pointer" }}
                >
                  <i className={showPwd3 ? "bi bi-eye-fill" : "bi bi-eye"} />
                </InputGroup.Text>
              </InputGroup>
            </Form.Group>

            <div className="text-end">
              <Button type="submit" variant="warning" disabled={pwdLoading}>
                {pwdLoading ? (
                  <>
                    <Spinner
                      animation="border"
                      size="sm"
                      className="me-2"
                    />
                    保存中…
                  </>
                ) : (
                  "保存密码"
                )}
              </Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>

      {/* 更新电话弹窗 */}
      <Modal
        show={showPhoneModal}
        onHide={() => setShowPhoneModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>更新联系电话</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {phoneError && <Alert variant="danger">{phoneError}</Alert>}
          {phoneSuccess && <Alert variant="success">{phoneSuccess}</Alert>}

          <Form onSubmit={handleSubmitPhone}>
            <Form.Group controlId="phone-new" className="mb-3">
              <Form.Label>新的联系电话</Form.Label>
              <Form.Control
                type="text"
                value={phoneForm.phone}
                onChange={(e) =>
                  setPhoneForm({ phone: e.target.value })
                }
                placeholder="例如：0412 345 678"
                required
              />
            </Form.Group>

            <div className="text-end">
              <Button
                type="submit"
                variant="primary"
                disabled={phoneLoading}
              >
                {phoneLoading ? (
                  <>
                    <Spinner
                      animation="border"
                      size="sm"
                      className="me-2"
                    />
                    保存中…
                  </>
                ) : (
                  "保存电话"
                )}
              </Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>
    </>
  );
}
