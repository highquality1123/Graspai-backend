import { IsNumber, IsString } from "class-validator";

export class GenerateFlashcardsSetRequestDto {
    @IsString()
    topic: string;

    @IsString()
    documentId: string;

    @IsNumber()
    cardsCount: number;
}
