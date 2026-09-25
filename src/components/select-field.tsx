"use client";

import { ListBox, Select } from "@heroui/react";

type Option = { id: string; label: string };

export function SelectField({ label, labelledBy, value, options, onChange, disabled }: {
  disabled?: boolean;
  label?: string;
  labelledBy?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  return <Select isDisabled={disabled} className="select-field" fullWidth aria-label={label} aria-labelledby={labelledBy} value={value} onChange={(key) => { if (key !== null) onChange(String(key)); }}>
    <Select.Trigger><Select.Value>{options.find((option) => option.id === value)?.label}</Select.Value><Select.Indicator/></Select.Trigger>
    <Select.Popover className="select-field-popover">
      <ListBox items={options}>
        {(option) => <ListBox.Item id={option.id} textValue={option.label}>{option.label}<ListBox.ItemIndicator/></ListBox.Item>}
      </ListBox>
    </Select.Popover>
  </Select>;
}
