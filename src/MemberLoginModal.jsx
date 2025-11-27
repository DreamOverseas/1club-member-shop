import React, { useState } from 'react';
import { Modal, Form, Button, Alert, InputGroup } from 'react-bootstrap';
import axios from 'axios';
import Cookies from 'js-cookie';
import { useNavigate } from 'react-router-dom';

const MemberLoginModal = ({ show, onHide }) => {
  const API_ENDPOINT = import.meta.env.VITE_CMS_API_ENDPOINT;
  const API_KEY = import.meta.env.VITE_CMS_API_KEY;

  // Managing Password showing
  const [showPassword1, setShowPassword1] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [showPassword3, setShowPassword3] = useState(false);
  const toggleShowPassword1 = () => setShowPassword1((prev) => !prev);
  const toggleShowPassword2 = () => setShowPassword2((prev) => !prev);
  const toggleShowPassword3 = () => setShowPassword3((prev) => !prev);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    membershipNumber: '',
    password: '',
    confirmPassword: '',
    docId: '',
  });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1: Info Check, 2: Password Setup, 3: Login with pwd

  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setStatus('');

    try {
      const response = await axios.get(
        `${API_ENDPOINT}/api/one-club-memberships?filters[MembershipNumber][$eq]=${formData.membershipNumber}`,
        {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }
      );

      const memberData = response.data?.data[0];

      if (!memberData) {
        setError('会员号不存在，请检查后重试！');
        return;
      }

      switch (memberData.CurrentStatus) {
        case 'Confirmed':
          if (
            (!memberData.Email && formData.name === memberData.Name) ||
            (memberData.Email === formData.email.toLowerCase())
          ) {
            setFormData({ ...formData, docId: memberData.documentId });
            setStep(2);
          } else {
            setError('信息不匹配，请核对后重试。');
          }
          break;

        case 'Active':
          if (formData.name !== memberData.Name || memberData.Email !== formData.email.toLowerCase()) {
            setError('会员信息不匹配，请核对后重试。');
            break;
          }

          if (step !== 3) {
            setStep(3);
            break;
          }

          try {
            const response = await axios.post(
              `${API_ENDPOINT}/api/one-club-memberships/verify-password`,
              {
                membershipNumber: formData.membershipNumber,
                password: formData.password,
              },
              {
                headers: { Authorization: `Bearer ${API_KEY}` },
              }
            );

            if (response.status === 200) {
              Cookies.set('authToken', '1club-auth-token', { expires: 7 });
              Cookies.set('user', JSON.stringify({
                "name": memberData.Name,
                "number": memberData.MembershipNumber,
                "email": memberData.Email,
                "class": memberData.MembershipClass,
                "exp": memberData.ExpiryDate,
                "points": memberData.Point,
                "discount_point": memberData.DiscountPoint,
                "loyalty_point": memberData.LoyaltyPoint,
              }), { expires: 7 });
              navigate('/member-center');
              window.location.reload();
            }
          } catch (err) {
            if (err.response) {
              if (err.response.status === 401) {
                setError('密码错误，请重试。');
              } else if (err.response.status === 404) {
                setError('会员号不存在，请核对后重试。');
              } else {
                setError(err.response.data.message || '发生未知错误，请稍后重试。');
              }
            } else if (err.request) {
              setError('无法连接到服务器，请检查网络连接。');
            } else {
              setError('发生未知错误，请稍后重试。');
              console.error(err);
            }
          }
          break;

        case 'Applied':
          setStatus('会员资格仍正在审核中，请您耐心等待...');
          break;

        case 'Suspended':
          if (formData.name !== memberData.Name || memberData.Email !== formData.email.toLowerCase()) {
            setError('会员信息不匹配，请核对后重试。');
            break;
          }
          setStatus('会员已过期或已被注销，如有问题欢迎随时联系我们！');
          break;

        default:
          setStatus('未找到会员或申请正在审核中，如有问题欢迎随时联系我们！');
          break;
      }
    } catch (err) {
      setError('请求失败，请稍后重试。');
      console.error(err);
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setError('两次密码输入不一致，请重试。');
      return;
    }

    try {
      const member_res =await axios.get(
        `${API_ENDPOINT}/api/one-club-memberships/${formData.docId}`,
        {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }
      );
      // console.log("Found: ", member_res);
      const curr_data = member_res.data.data;
      // console.log("Data: ", curr_data);
      // eslint-disable-next-line no-unused-vars
      const { id, ...cleaned_data } = curr_data; // Currently no use?
      // console.log("Cleaned: ", cleaned_data);
      const payload_data = {
          data: {
            Email: formData.email.toLowerCase(),
            Name: formData.name,
            CurrentStatus: "Active",
            Password: formData.password
          },
        };
      await axios.put(
        `${API_ENDPOINT}/api/one-club-memberships/${curr_data.documentId}`,
        payload_data,
        {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }
      );
      const response = await axios.get(
        `${API_ENDPOINT}/api/one-club-memberships?filters[MembershipNumber][$eq]=${formData.membershipNumber}`,
        {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }
      );

      const memberData = response.data.data[0];
      Cookies.set('authToken', 'your-auth-token', { expires: 7 });
      Cookies.set('user', JSON.stringify({
        "name": memberData.Name,
        "number": memberData.MembershipNumber,
        "email": memberData.Email,
        "class": memberData.MembershipClass,
        "address": memberData.Address,
        "exp": memberData.ExpiryDate,
        "points": memberData.Point,
        "discount_point": memberData.DiscountPoint,
        "loyalty_point": memberData.LoyaltyPoint,
      }), { expires: 7 });
      navigate('/member-center');
      window.location.reload();
    } catch (err) {
      window.alert(error);
      setError('更新失败，请稍后重试。');
      console.error(err);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>激活/登录</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {status && <Alert variant="info">{status}</Alert>}
        {error && <Alert variant="danger">{error}</Alert>}

        {step === 1 && (
          <Form onSubmit={handleSubmit}>
            <Form.Group controlId="formName" className="mb-3">
              <Form.Label>姓名</Form.Label>
              <Form.Control
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </Form.Group>
            <Form.Group controlId="formEmail" className="mb-3">
              <Form.Label>邮箱</Form.Label>
              <Form.Control
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </Form.Group>
            <Form.Group controlId="formMembershipNumber" className="mb-3">
              <Form.Label>会员号</Form.Label>
              <Form.Control
                type="text"
                name="membershipNumber"
                value={formData.membershipNumber}
                onChange={handleChange}
                required
              />
            </Form.Group>
            <Button type="submit" variant="dark" className="w-100">
              提交
            </Button>
          </Form>
        )}

        {step === 2 && (
          <Form onSubmit={handleSetPassword}>
            <h5 className="text-center">欢迎您首次登录/激活</h5>

            <Form.Group controlId="formPassword" className="mb-3">
              <Form.Label>设置密码</Form.Label>
              <InputGroup>
                <Form.Control
                  // 当 showPassword1 为 true 时，type 是 "text"（明文），否则是 "password"（密文）
                  type={showPassword1 ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
                <InputGroup.Text
                  onClick={toggleShowPassword1}
                  style={{ cursor: 'pointer' }}
                >
                  {/* 根据 showPassword1 切换不同的图标 */}
                  <i className={showPassword1 ? 'bi bi-eye-fill' : 'bi bi-eye'} />
                </InputGroup.Text>
              </InputGroup>
              <Form.Text muted>
                密码最低不少于8个字符，推荐数字与字母的结合
              </Form.Text>
            </Form.Group>

            <Form.Group controlId="formConfirmPassword" className="mb-3">
              <Form.Label>确认密码</Form.Label>
              <InputGroup>
                <Form.Control
                  type={showPassword2 ? 'text' : 'password'}
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                />
                <InputGroup.Text
                  onClick={toggleShowPassword2}
                  style={{ cursor: 'pointer' }}
                >
                  <i
                    className={showPassword2 ? 'bi bi-eye-fill' : 'bi bi-eye'}
                  />
                </InputGroup.Text>
              </InputGroup>
            </Form.Group>

            <Button type="submit" variant="dark" className="w-100">
              保存密码并登录
            </Button>
          </Form>
        )}

        {step === 3 && (
          <Form onSubmit={handleSubmit}>
            <h5 className="text-center">欢迎回来</h5>
            <Form.Group controlId="formPassword" className="mb-3">
              <Form.Label>输入密码</Form.Label>
              <InputGroup>
                <Form.Control
                  type={showPassword3 ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
                <InputGroup.Text
                  onClick={toggleShowPassword3}
                  style={{ cursor: 'pointer' }}
                >
                  <i
                    className={showPassword3 ? 'bi bi-eye-fill' : 'bi bi-eye'}
                  />
                </InputGroup.Text>
              </InputGroup>
              <Form.Text muted>
                请输入您的密码 （注：不低于8个字符）, 完成后点击登录按钮登入会员中心。
              </Form.Text>
            </Form.Group>

            <Button type="submit" variant="dark" className="w-100">
              登录
            </Button>
          </Form>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default MemberLoginModal;
