"use client";

import Image from "next/image";
import { useState } from "react";

export function ItemHeroImage({ id, name }: { id: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-2xl font-bold text-brand-dark ring-1 ring-brand/15 sm:h-32 sm:w-32">
        {name.slice(0, 1)}
      </div>
    );
  }
  return (
    <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl ring-1 ring-black/5 sm:h-32 sm:w-32">
      <Image
        src={`/images/items/${id}.png`}
        alt={name}
        fill
        sizes="128px"
        className="object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
