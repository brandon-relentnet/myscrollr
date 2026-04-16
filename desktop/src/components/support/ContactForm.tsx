interface ContactFormProps {
  onBack: () => void;
}

export default function ContactForm({ onBack }: ContactFormProps) {
  return (
    <div className="py-6 text-fg-3 text-sm">
      Contact form — coming soon
      <button onClick={onBack} className="ml-2 text-accent hover:underline cursor-pointer">
        Back
      </button>
    </div>
  );
}
