"use client";

import { useState } from "react";
import PhoneNumberInput, { parsePhoneNumber, type Value } from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import labels from "react-phone-number-input/locale/pt-BR";
import "react-phone-number-input/style.css";

import styles from "./PhoneField.module.css";

type PhoneFieldProps = {
  autoComplete?: string;
  defaultValue?: string | null;
  disabled?: boolean;
  id?: string;
  name: string;
  required?: boolean;
};

function normalizePhone(value?: string | null): Value | undefined {
  if (!value) return undefined;

  try {
    return parsePhoneNumber(value, "BR")?.number;
  } catch {
    return undefined;
  }
}

export function PhoneField({
  autoComplete = "tel",
  defaultValue,
  disabled,
  id,
  name,
  required,
}: PhoneFieldProps) {
  const [value, setValue] = useState<Value | undefined>(() => normalizePhone(defaultValue));

  return (
    <>
      <input name={name} type="hidden" value={value ?? ""} />
      <PhoneNumberInput
        id={id}
        className={styles.phoneInput}
        value={value}
        onChange={setValue}
        autoComplete={autoComplete}
        defaultCountry="BR"
        flags={flags}
        labels={labels}
        international={false}
        addInternationalOption={false}
        limitMaxLength
        placeholder="(11) 99999-9999"
        disabled={disabled}
        required={required}
      />
    </>
  );
}
