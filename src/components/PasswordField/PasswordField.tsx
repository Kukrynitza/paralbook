'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
}) {
  const [shown, setShown] = useState(false)
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <input
          className="input"
          type={shown ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
        />
        <button type="button" className="eye" onClick={() => setShown((item) => !item)} aria-label="Показать пароль">
          {shown ? <Eye size={18} /> : <EyeOff size={18} />}
        </button>
      </div>
    </label>
  )
}
