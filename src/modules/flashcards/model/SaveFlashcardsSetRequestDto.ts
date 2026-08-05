import { IsString } from "class-validator";

export class FlashcardItem {
    @IsString()
    question: string;

    @IsString()
    answer: string;
}

export class SaveFlashcardsSetRequestDto {
    @IsString()
    topic: string;

    @IsString()
    documentId: string;

    cards: FlashcardItem[];
}
