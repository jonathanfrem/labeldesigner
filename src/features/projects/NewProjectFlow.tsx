import { useState } from 'react';
import type { SheetTemplate } from '../../model/types';
import { defaultCustomTemplate } from '../../lib/defaultTemplate';
import { CustomTemplateEditor } from '../templates/CustomTemplateEditor';
import { TemplatePicker } from './TemplatePicker';

export interface NewProjectFlowProps {
  templates: SheetTemplate[];
  onCreateWithTemplate: (name: string, template: SheetTemplate) => void;
  onCreateWithCustomTemplate: (name: string, template: SheetTemplate) => void;
  onCancel: () => void;
}

type Step = 'name' | 'choose' | 'template' | 'custom';

/**
 * Guided "start a new project" flow (name, then template-or-custom-size),
 * separate from the Templates catalogue screen — that screen manages the
 * reusable template library; this one's only job is getting the user into a
 * Workbench with a named document as quickly as possible.
 */
export function NewProjectFlow({ templates, onCreateWithTemplate, onCreateWithCustomTemplate, onCancel }: NewProjectFlowProps) {
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [customDraft] = useState<SheetTemplate>(() => defaultCustomTemplate());

  if (step === 'template') {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-mat">
        <TemplatePicker templates={templates} onSelect={(t) => onCreateWithTemplate(name, t)} onBack={() => setStep('choose')} />
      </div>
    );
  }

  if (step === 'custom') {
    return (
      <CustomTemplateEditor
        title="Custom label size"
        initial={customDraft}
        onSave={(t) => onCreateWithCustomTemplate(name, t)}
        onCancel={() => setStep('choose')}
        cancelLabel="Back"
        saveLabel="Save & create project"
      />
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-mat">
      <div className="w-full max-w-md space-y-5">
        {step === 'name' && (
          <>
            <div>
              <h2 className="text-sm font-medium text-ink mb-1">New project</h2>
              <p className="text-xs text-ink-tertiary">Give it a name — you can change this later.</p>
            </div>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Sourdough starter jar label"
              className="w-full bg-panel-raised border border-line rounded px-3 py-2 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setStep('choose');
              }}
            />
            <div className="flex gap-2">
              <button
                className="flex-1 bg-accent hover:bg-accent/90 text-white rounded px-3 py-2 text-sm font-medium"
                onClick={() => setStep('choose')}
              >
                Continue
              </button>
              <button className="flex-1 bg-panel-raised hover:bg-line rounded px-3 py-2 text-sm text-ink border border-line" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </>
        )}

        {step === 'choose' && (
          <>
            <div>
              <h2 className="text-sm font-medium text-ink mb-1">{name || 'New project'}</h2>
              <p className="text-xs text-ink-tertiary">Pick a label stock to start from.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                className="bg-panel-raised hover:bg-line rounded px-4 py-6 text-sm text-ink border border-line text-center"
                onClick={() => setStep('template')}
              >
                Choose a template
                <span className="block text-xs text-ink-tertiary mt-1">Pick from the built-in and custom catalogue</span>
              </button>
              <button
                className="bg-panel-raised hover:bg-line rounded px-4 py-6 text-sm text-ink border border-line text-center"
                onClick={() => setStep('custom')}
              >
                Custom label size
                <span className="block text-xs text-ink-tertiary mt-1">Measure your own stock and enter the geometry</span>
              </button>
            </div>
            <button className="text-xs text-ink-secondary hover:text-ink" onClick={() => setStep('name')}>
              &larr; Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
