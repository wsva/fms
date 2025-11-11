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
    <Card className="flex bg-sand-300 max-w-[400px] m-2">
      <CardHeader>
        <Link href={href} className="font-bold text-blue-600 hover:underline select-none" >
          {label}
        </Link>
      </CardHeader>
      <Divider />
      <CardBody>
        <p className="select-none">{description}</p>
      </CardBody>
    </Card>
  )
}