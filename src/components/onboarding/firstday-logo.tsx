import Image from 'next/image';
import type { ReactNode } from 'react';

/** Firstday's own vector mark, shared by the workspace and role chooser. */
export function FirstdayLogo(): ReactNode {
  const base = (process.env.NEXT_PUBLIC_APP_BASE_PATH || '').replace(/\/$/, '');
  return (
    <Image
      className='fd-logo'
      src={`${base}/firstday-logo.svg?v=sunrise`}
      alt=''
      width={40}
      height={40}
      unoptimized
    />
  );
}
