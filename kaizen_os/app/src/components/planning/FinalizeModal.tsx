import { useState } from 'react';
import type { GcalAssignment } from './ActionPlanPanel';

interface FinalizeModalProps {
  assignments: GcalAssignment[];
  existingRuleEventTitles: Set<string>;
  onConfirm: (rulesToCreate: string[]) => void;
  onCancel: () => void;
  loading: boolean;
}

export function FinalizeModal({ assignments, existingRuleEventTitles, onConfirm, onCancel, loading }: FinalizeModalProps) {
  // Pre-select assignments that already have matching rules
  const [selectedRules, setSelectedRules] = useState<Set<string>>(() => {
    const preSelected = new Set<string>();
    for (const a of assignments) {
      if (existingRuleEventTitles.has(a.eventTitle.trim())) {
        preSelected.add(a.eventId);
      }
    }
    return preSelected;
  });

  const toggleRule = (eventId: string) => {
    setSelectedRules(prev => {
      const newSet = new Set(prev);
      if (newSet.has(eventId)) {
        newSet.delete(eventId);
      } else {
        newSet.add(eventId);
      }
      return newSet;
    });
  };

  const hasExistingRule = (eventTitle: string) => existingRuleEventTitles.has(eventTitle.trim());

  return (
    <div className="event-edit-overlay" onClick={onCancel}>
      <div className="event-edit-modal finalize-modal" onClick={e => e.stopPropagation()}>
        <h4>Finalize Plan</h4>
        
        {assignments.length > 0 && (
          <>
            <p className="modal-subtitle">You assigned {assignments.length} calendar event(s) to actions. Remember these for future weeks?</p>
            <div className="assignments-list">
              {assignments.map(a => {
                const alreadyHasRule = hasExistingRule(a.eventTitle);
                return (
                  <label key={a.eventId} className={`assignment-item ${alreadyHasRule ? 'has-rule' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedRules.has(a.eventId)}
                      onChange={() => toggleRule(a.eventId)}
                    />
                    <div className="assignment-info">
                      <div className="event-name">
                        "{a.eventTitle}"
                        {alreadyHasRule && <span className="existing-rule-badge">Rule exists</span>}
                      </div>
                      <div className="action-name">→ {a.actionTitle}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="hint">Checked items will auto-assign in future weeks.</p>
          </>
        )}

        {assignments.length === 0 && (
          <p className="modal-subtitle">Ready to finalize your plan for this week?</p>
        )}
        
        <div className="modal-actions">
          <button className="modal-btn cancel" onClick={onCancel} disabled={loading}>Cancel</button>
          <button 
            className="modal-btn save" 
            onClick={() => onConfirm(Array.from(selectedRules))}
            disabled={loading}
          >
            {loading ? 'Finalizing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
