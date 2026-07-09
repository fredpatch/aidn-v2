import { Toaster as Sonner, type ToasterProps } from 'sonner';

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      closeButton
      richColors
      position="top-right"
      toastOptions={{
        className: 'font-sans',
      }}
      {...props}
    />
  );
}
