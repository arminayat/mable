"use client";

import { useState } from "react";
import { ComboBox, Input, ListBox } from "@heroui/react";
import type { Label } from "./types";

export function LabelPicker({ labels, value, disabled, onChange, onCreate }: {
  labels: Label[];
  value?: string;
  disabled: boolean;
  onChange: (value: string | undefined) => void;
  onCreate: (name: string) => Promise<Label | undefined>;
}) {
  const [query, setQuery] = useState(labels.find((label) => label.id === value)?.name ?? "");
  const [created, setCreated] = useState<Label[]>([]);
  const allLabels = [...labels, ...created.filter((label) => !labels.some((item) => item.id === label.id))];
  const search = query.trim();
  const matches = allLabels.filter((label) => label.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const items = matches.length || !search
    ? [{ id: "no-label", name: "No label" }, ...matches]
    : [{ id: "create-label", name: `Create label “${search}”` }];

  async function select(key: React.Key | null) {
    if (key === "create-label") {
      const label = await onCreate(search);
      if (label) {
        setCreated((current) => [...current, label]);
        setQuery(label.name);
      }
    } else if (key !== null) {
      const label = allLabels.find((item) => item.id === key);
      onChange(label?.id);
      setQuery(label?.name ?? "");
    }
  }

  return <ComboBox className="select-field label-picker" fullWidth aria-label="Gmail label" isDisabled={disabled}
    items={items} inputValue={query} onInputChange={setQuery}
    selectedKey={value ?? null} onSelectionChange={(key) => { void select(key); }} allowsCustomValue>
    <ComboBox.InputGroup><Input placeholder="Search labels…"/><ComboBox.Trigger/></ComboBox.InputGroup>
    <ComboBox.Popover className="select-field-popover">
      <ListBox>{(item: { id: string; name: string }) => <ListBox.Item id={item.id} textValue={item.name}>{item.name}</ListBox.Item>}</ListBox>
    </ComboBox.Popover>
  </ComboBox>;
}
