"use client";

import { Button, Modal } from "@heroui/react";

export function HowItWorks() {
  return <Modal>
    <Button variant="ghost" className="footer-link">How it works</Button>
    <Modal.Backdrop>
      <Modal.Container size="md" placement="center" scroll="inside">
        <Modal.Dialog className="how-it-works">
          <Modal.CloseTrigger aria-label="Close how it works" />
          <Modal.Header><Modal.Heading>How Mable works</Modal.Heading></Modal.Header>
          <Modal.Body>
            <ol>
              <li><strong>Ask a question.</strong><p>Write a yes-or-no question about your emails, like “Does this need a reply?” As you type, action buttons appear below your question. Choose what happens when it matches, then save.</p></li>
              <li><strong>Choose your actions.</strong><p>Apply a Gmail label, star the email, mark it as read, or archive it. You can combine actions.</p></li>
              <li><strong>Put your questions in order.</strong><p>Mable uses the first question that meets your match threshold. If none match, the email stays unchanged. You can edit, reorder, or disable questions anytime.</p></li>
              <li><strong>Run when you’re ready.</strong><p>Add your TypeSafe or Vercel AI Gateway API key in Settings, then choose Run now to process new mail, the last 50 emails, the last 30 days, or your entire inbox. Or turn on automatic cleanup in Settings for new mail.</p></li>
            </ol>
            <p className="muted">Actions apply directly in Gmail. AI can make mistakes, so start with a label or star and check the results before using archive. Mable does not store email content; it sends the content needed for evaluation to TypeSafe directly or through Vercel AI Gateway using your saved key.</p>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  </Modal>;
}
