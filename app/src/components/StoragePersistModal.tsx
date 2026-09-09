import React, { useState, useEffect } from 'react';
import { IconCheck } from './CivicIcons';

export const StoragePersistModal: React.FC = () => {
  const [showModal, setShowModal] = useState<boolean>(false);

  useEffect(() => {
    async function checkPersistence() {
      if (navigator.storage && navigator.storage.persisted) {
        const isPersisted = await navigator.storage.persisted();
        if (!isPersisted && !localStorage.getItem('civiclens_persist_prompted')) {
          setShowModal(true);
        }
      }
    }
    checkPersistence();
  }, []);

  const handleRequestPersistence = async () => {
    localStorage.setItem('civiclens_persist_prompted', 'true');
    setShowModal(false);
    if (navigator.storage && navigator.storage.persist) {
      const granted = await navigator.storage.persist();
      console.log('Storage persistence granted:', granted);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem('civiclens_persist_prompted', 'true');
    setShowModal(false);
  };

  if (!showModal) return null;

  return (
    <div className="persist-modal-overlay">
      <div className="persist-modal-box">
        <div className="persist-icon">
          <IconCheck size={22} color="var(--color-accent)" />
        </div>
        <h3>Save Maps & Reports Offline</h3>
        <p>
          Allow CivicLens to keep offline village maps and issue reports stored safely on your phone so your survey work is never deleted by the browser.
        </p>
        <div className="persist-actions">
          <button type="button" className="btn-primary-action" onClick={handleRequestPersistence}>
            Allow Offline Storage
          </button>
          <button type="button" className="filter-chip" style={{ width: '100%', justifyContent: 'center' }} onClick={handleDismiss}>
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
};
