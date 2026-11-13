import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

/** The title, a line about the page, and the buttons that belong to the whole page. */
export function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <header className="ss-page-header">
      <div className="ss-page-header-text">
        <h1>{title}</h1>
        {description && <p className="ss-page-header-description">{description}</p>}
      </div>
      {children && <div className="ss-page-header-actions">{children}</div>}
    </header>
  );
}
