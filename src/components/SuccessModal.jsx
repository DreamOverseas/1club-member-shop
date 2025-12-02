// src/components/SuccessModal.jsx
import React from "react";
import { Modal, Button } from "react-bootstrap";

export default function SuccessModal({ show, title, onHide, children }) {
  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title || "兑换成功"}</Modal.Title>
      </Modal.Header>

      <Modal.Body className="text-center">
        {/* 绿色勾 */}
        <i
          className="bi bi-check-circle"
          style={{ fontSize: "3rem", color: "green" }}
        ></i>

        {/* ✅ 勾下面这一行文字 */}
        <p className="mt-3 mb-0">
          {children || "兑换成功"}
        </p>
      </Modal.Body>

      <Modal.Footer>
        <Button
          variant="dark"
          className="w-100"
          onClick={onHide} // ⬅️ 点“确定”就触发 onHide
        >
          确定
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
