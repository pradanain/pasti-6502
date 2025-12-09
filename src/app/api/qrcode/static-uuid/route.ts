import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/prisma";

export async function GET() {
	try {
		const envStatic = process.env.NEXT_PUBLIC_STATIC_UUID;
		if (envStatic) {
			return NextResponse.json({ staticUuid: envStatic, source: "env" });
		}

		const existing = await prisma.qRCode.findFirst({
			orderBy: { createdAt: "desc" },
		});

		if (existing) {
			return NextResponse.json({
				staticUuid: existing.staticUuid,
				source: "database",
			});
		}

		const generated = uuidv4();
		await prisma.qRCode.create({
			data: {
				staticUuid: generated,
				path: "/qrcodes/pst-qrcode.png",
			},
		});

		return NextResponse.json({
			staticUuid: generated,
			source: "generated",
		});
	} catch (error) {
		console.error("Failed to resolve static UUID", error);
		return NextResponse.json(
			{ error: "Tidak dapat menyiapkan static UUID" },
			{ status: 500 }
		);
	}
}
