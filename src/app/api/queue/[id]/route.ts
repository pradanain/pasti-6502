import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: Request) {
	const pathname = new URL(req.url).pathname;
	const segments = pathname.split("/").filter(Boolean);
	const queueId = segments[segments.length - 1];

	if (!queueId) {
		return NextResponse.json({ error: "Queue ID is required" }, { status: 400 });
	}

	try {
		const queue = await prisma.queue.findUnique({
			where: { id: queueId },
			include: {
				service: { select: { name: true } },
				visitor: { select: { name: true, phone: true } },
				guest: { select: { fullName: true, phone: true } },
			},
		});

		if (!queue) {
			return NextResponse.json({ error: "Queue not found" }, { status: 404 });
		}

		return NextResponse.json({
			queueId: queue.id,
			queueNumber: queue.queueNumber,
			status: queue.status,
			queueType: queue.queueType,
			serviceName: queue.service.name,
			visitorName: queue.visitor?.name || queue.guest?.fullName || "Pengunjung",
			createdAt: queue.createdAt,
			startTime: queue.startTime,
			endTime: queue.endTime,
			updatedAt: queue.updatedAt,
		});
	} catch (error) {
		console.error("Error fetching queue status:", error);
		return NextResponse.json(
			{ error: "Failed to fetch queue status" },
			{ status: 500 }
		);
	}
}
