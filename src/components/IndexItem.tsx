'use client'

import { Card, CardBody, CardHeader, Divider } from "@heroui/react";
import Link from "next/link";

type Props = {
  href: string;
  label: string;
  description: string;
}

export const IndexItem = ({ href, label, description }: Props) => {
  return (
    <Link href={href} className="block max-w-[400px] m-2">
      <Card className="flex bg-sand-300 hover:bg-sand-400 transition-colors cursor-pointer h-full">
        <CardHeader>
          <span className="font-bold text-blue-600 select-none">{label}</span>
        </CardHeader>
        <Divider />
        <CardBody>
          <p className="select-none">{description}</p>
        </CardBody>
      </Card>
    </Link>
  )
}