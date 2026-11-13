import type { Ref } from 'react';
import { useState } from 'react';

interface NameFieldProps {
  id: string;
  /** The name as it is saved (already tidied up). */
  value: string;
  maxLength?: number;
  placeholder?: string;
  onChange: (text: string) => void;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * A name box. The name is saved as she types, but the box keeps showing exactly what she typed
 * (so a space at the end isn't snatched away). When she leaves the box it shows the saved name.
 */
export function NameField({ id, value, maxLength, placeholder, onChange, inputRef }: NameFieldProps) {
  const [typed, setTyped] = useState(value);
  const [focused, setFocused] = useState(false);
  return (
    <input
      id={id}
      ref={inputRef}
      className="ss-input"
      type="text"
      autoComplete="off"
      maxLength={maxLength}
      placeholder={placeholder}
      value={focused ? typed : value}
      onFocus={() => {
        setTyped(value);
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        setTyped(e.currentTarget.value);
        onChange(e.currentTarget.value);
      }}
    />
  );
}
