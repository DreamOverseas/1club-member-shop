// src/components/SuccessModal.jsx
import React from "react";
import { Modal, Button } from "react-bootstrap";

export default function SuccessModal({
  show,
  onClose,
  title,
  message,
}) {
  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body className="text-center">
        <i className="bi bi-check-circle member-shop-success-icon" />
        <p className="mt-3">{message}</p>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="dark" className="w-100" onClick={onClose}>
          确定
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
