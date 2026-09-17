type BleacherTypeDescriptionFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

export function BleacherTypeDescriptionField({
  value,
  onChange,
}: BleacherTypeDescriptionFieldProps) {
  return (
    <div>
      <label
        htmlFor="bleacher-type-description"
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        Description
      </label>
      <textarea
        id="bleacher-type-description"
        rows={5}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Describe this bleacher type — copied onto the line item when it's added to a quote."
        className="w-full resize-y px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-darkBlue"
      />
    </div>
  );
}
