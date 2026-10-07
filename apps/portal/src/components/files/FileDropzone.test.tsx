import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileDropzone, MAX_UPLOAD_BYTES, TEXT_DOCUMENT_ACCEPT, validateUploadFile } from './FileDropzone';

const ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg';
function fileOf(name: string, size: number, type: string): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}
const pdf = (size: number, name = 'scan.pdf') => fileOf(name, size, 'application/pdf');

describe('validateUploadFile - same rules as the server, before any byte is sent', () => {
  it('accepts a valid PDF', () => expect(validateUploadFile(pdf(1_400_000), ACCEPT)).toBeNull());
  it('extension check ignores case', () => expect(validateUploadFile(pdf(10, 'SCAN.PDF'), ACCEPT)).toBeNull());
  it('size limit mirrors the API: 20 MiB - 1 accepted, 20 MiB refused (measured 201 / 413)', () => {
    expect(validateUploadFile(pdf(MAX_UPLOAD_BYTES - 1), ACCEPT)).toBeNull();
    expect(validateUploadFile(pdf(MAX_UPLOAD_BYTES), ACCEPT)).toMatch(/maximum 20,0 Mo/);
  });
  it('refuses an empty file', () => expect(validateUploadFile(pdf(0), ACCEPT)).toMatch(/vide/));
  it('refuses a wrong extension', () =>
    expect(validateUploadFile(fileOf('a.exe', 10, 'application/x-msdownload'), ACCEPT)).toMatch(/^Format non accepté/));
  it('the letter field (PDF/Word only) refuses an image', () =>
    expect(validateUploadFile(fileOf('photo.png', 10, 'image/png'), TEXT_DOCUMENT_ACCEPT)).not.toBeNull());
  it('refuses a MIME outside the shared list even with a .pdf name', () =>
    expect(validateUploadFile(fileOf('fake.pdf', 10, 'text/html'), ACCEPT)).not.toBeNull());
  it('without a browser MIME, the extension decides', () =>
    expect(validateUploadFile(fileOf('doc.docx', 10, ''), ACCEPT)).toBeNull());
});

function Harness() {
  const [file, setFile] = useState<File | null>(null);
  return (
    <>
      <FileDropzone label="Déposer ma quittance" file={file} onFileChange={setFile} />
      <output data-testid="picked">{file?.name ?? 'none'}</output>
    </>
  );
}

describe('<FileDropzone>', () => {
  it('is a real file input, bound to its label, with the limit announced', () => {
    render(<Harness />);
    const input = screen.getByLabelText(/Déposer ma quittance/);
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAccessibleDescription(/20,0 Mo max/);
  });

  it('refuses a too-large file with an inline alert and selects nothing', async () => {
    render(<Harness />);
    await userEvent.upload(screen.getByLabelText(/Déposer ma quittance/), pdf(34 * 1024 * 1024));
    expect(screen.getByRole('alert')).toHaveTextContent('34,0 Mo');
    expect(screen.getByTestId('picked')).toHaveTextContent('none');
  });

  it('shows the chosen file, then lets the applicant remove it', async () => {
    render(<Harness />);
    await userEvent.upload(screen.getByLabelText(/Déposer ma quittance/), pdf(1_468_006, 'quittance.pdf'));
    expect(screen.getByText('quittance.pdf', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('1,4 Mo')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Retirer quittance.pdf/ }));
    expect(screen.getByTestId('picked')).toHaveTextContent('none');
    expect(screen.getByLabelText(/Déposer ma quittance/)).toBeInTheDocument();
  });

  it('drag-and-drop goes through the same validation', () => {
    render(<Harness />);
    const zone = screen.getByText('Déposer ma quittance').closest('label')!;
    fireEvent.drop(zone, { dataTransfer: { files: [fileOf('glisse.png', 2000, 'image/png')] } });
    expect(screen.getByTestId('picked')).toHaveTextContent('glisse.png');
  });
});
