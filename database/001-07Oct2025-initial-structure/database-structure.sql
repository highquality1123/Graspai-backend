-- public.chapters definition

-- Drop table

-- DROP TABLE public.chapters;

CREATE TABLE public.chapters (
                                 id bigserial NOT NULL,
                                 document_id uuid NULL,
                                 chapters jsonb NULL
);
CREATE UNIQUE INDEX chapters_id_idx ON public.chapters USING btree (id);


-- public.profiles definition

-- Drop table

-- DROP TABLE public.profiles;

CREATE TABLE public.profiles (
                                 id uuid DEFAULT gen_random_uuid() NOT NULL,
                                 created_at timestamptz DEFAULT now() NOT NULL,
                                 email varchar NOT NULL,
                                 full_name varchar NULL,
                                 updated_at timestamptz NULL,
                                 profile_picture varchar NULL,
                                 profile_status varchar NULL,
                                 is_premium_user bool DEFAULT false NULL,
                                 "role" text NULL,
                                 confirmation_otp varchar NULL,
                                 confirmation_otp_expiry timestamptz NULL,
                                 confirmed bool DEFAULT false NULL,
                                 password_reset_otp varchar NULL,
                                 password_reset_otp_expiry timestamptz NULL,
                                 sso_enabled bool DEFAULT false NULL,
                                 CONSTRAINT profiles_email_key UNIQUE (email),
                                 CONSTRAINT profiles_pkey PRIMARY KEY (id)
);


-- public.subscription_plans definition

-- Drop table

-- DROP TABLE public.subscription_plans;

CREATE TABLE public.subscription_plans (
                                           "name" varchar NOT NULL,
                                           description varchar NOT NULL,
                                           pdf_pages int4 NOT NULL,
                                           transcription_minutes int4 NOT NULL,
                                           ai_prompts int4 NOT NULL,
                                           video_minutes int4 DEFAULT 0 NOT NULL,
                                           pdf_count int4 DEFAULT 0 NOT NULL,
                                           audio_count int4 DEFAULT 0 NOT NULL,
                                           video_count int4 DEFAULT 0 NOT NULL,
                                           features _text NULL,
                                           "index" int4 DEFAULT 100 NOT NULL,
                                           generated_video_count int4 DEFAULT 0 NOT NULL,
                                           is_hidden bool DEFAULT false NOT NULL,
                                           CONSTRAINT subscription_plans_pk PRIMARY KEY (name)
);


-- public.folders definition

-- Drop table

-- DROP TABLE public.folders;

CREATE TABLE public.folders (
                                id uuid NOT NULL,
                                created_at timestamptz DEFAULT now() NOT NULL,
                                "name" text NULL,
                                user_id uuid NOT NULL,
                                updated_at timestamptz DEFAULT now() NOT NULL,
                                CONSTRAINT folders_pkey PRIMARY KEY (id),
                                CONSTRAINT folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);


-- public.recordings definition

-- Drop table

-- DROP TABLE public.recordings;

CREATE TABLE public.recordings (
                                   duration float8 NULL,
                                   "type" varchar NULL,
                                   id uuid DEFAULT gen_random_uuid() NOT NULL,
                                   is_processed bool DEFAULT false NOT NULL,
                                   "language" varchar NOT NULL,
                                   user_id uuid NOT NULL,
                                   created_at timestamptz DEFAULT now() NOT NULL,
                                   url varchar NULL,
                                   "name" varchar NULL,
                                   initial_container_id uuid NULL,
                                   CONSTRAINT recordings_pk PRIMARY KEY (id),
                                   CONSTRAINT recordings_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE
);


-- public.subscription_plans_prices definition

-- Drop table

-- DROP TABLE public.subscription_plans_prices;

CREATE TABLE public.subscription_plans_prices (
                                                  subscription_plan_name varchar NOT NULL,
                                                  tenure varchar NOT NULL,
                                                  price numeric(10, 2) NOT NULL,
                                                  stripe_price_id varchar NULL,
                                                  id bigserial NOT NULL,
                                                  CONSTRAINT subscription_plans_prices_check CHECK (((tenure)::text = ANY ((ARRAY['monthly'::character varying, 'annual'::character varying])::text[]))),
                                                  CONSTRAINT subscription_plans_prices_pk PRIMARY KEY (id),
                                                  CONSTRAINT subscription_plans_prices_fk FOREIGN KEY (subscription_plan_name) REFERENCES public.subscription_plans("name") ON DELETE RESTRICT ON UPDATE CASCADE
);


-- public.subscriptions definition

-- Drop table

-- DROP TABLE public.subscriptions;

CREATE TABLE public.subscriptions (
                                      id uuid DEFAULT gen_random_uuid() NOT NULL,
                                      user_id uuid NULL,
                                      stripe_customer_id varchar NULL,
                                      stripe_subscription_id varchar NULL,
                                      subscription_status varchar NULL,
                                      created_at timestamptz NULL,
                                      updated_at timestamptz NULL,
                                      stripe_price_id varchar NULL,
                                      CONSTRAINT subscriptions_pk PRIMARY KEY (id),
                                      CONSTRAINT subscriptions_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE RESTRICT ON UPDATE RESTRICT
);


-- public.user_subscription_statistics definition

-- Drop table

-- DROP TABLE public.user_subscription_statistics;

CREATE TABLE public.user_subscription_statistics (
                                                     id bigserial NOT NULL,
                                                     user_id uuid NOT NULL,
                                                     pdf_pages int4 DEFAULT 0 NOT NULL,
                                                     transcription_minutes float4 DEFAULT 0 NOT NULL,
                                                     ai_prompts int4 DEFAULT 0 NOT NULL,
                                                     subscription_plan_name varchar NOT NULL,
                                                     date_from timestamptz DEFAULT now() NOT NULL,
                                                     date_to timestamptz DEFAULT now() NOT NULL,
                                                     created_at timestamptz DEFAULT now() NOT NULL,
                                                     updated_at timestamptz DEFAULT now() NOT NULL,
                                                     video_minutes float4 DEFAULT 0 NOT NULL,
                                                     pdf_count int4 DEFAULT 0 NOT NULL,
                                                     audio_count int4 DEFAULT 0 NOT NULL,
                                                     video_count int4 DEFAULT 0 NOT NULL,
                                                     generated_video_count int4 DEFAULT 0 NOT NULL,
                                                     CONSTRAINT user_subscription_statistics_pk PRIMARY KEY (id),
                                                     CONSTRAINT user_subscription_statistics_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
                                                     CONSTRAINT user_subscription_statistics_fk_1 FOREIGN KEY (subscription_plan_name) REFERENCES public.subscription_plans("name") ON DELETE RESTRICT ON UPDATE CASCADE
);


-- public.containers definition

-- Drop table

-- DROP TABLE public.containers;

CREATE TABLE public.containers (
                                   id uuid NOT NULL,
                                   "name" text NULL,
                                   created_at timestamptz DEFAULT now() NOT NULL,
                                   folder_id uuid NULL,
                                   migration_document_id uuid NULL,
                                   user_id uuid NULL,
                                   updated_at timestamptz DEFAULT now() NOT NULL,
                                   CONSTRAINT containers_pkey PRIMARY KEY (id),
                                   CONSTRAINT containers_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id),
                                   CONSTRAINT containers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);


-- public.documents definition

-- Drop table

-- DROP TABLE public.documents;

CREATE TABLE public.documents (
                                  created_at timestamptz DEFAULT now() NOT NULL,
                                  "name" varchar NULL,
                                  pages_count int8 NULL,
                                  length int8 NULL,
                                  tokens int8 NULL,
                                  url varchar NULL,
                                  user_id uuid NULL,
                                  id uuid NOT NULL,
                                  "token" int8 NULL,
                                  "isDemo" bool DEFAULT false NULL,
                                  "type" varchar DEFAULT 'pdf'::character varying NOT NULL,
                                  "language" varchar DEFAULT 'en'::character varying NOT NULL,
                                  container_id uuid NULL,
                                  CONSTRAINT documents_pkey PRIMARY KEY (id),
                                  CONSTRAINT documents_container_id_fkey FOREIGN KEY (container_id) REFERENCES public.containers(id),
                                  CONSTRAINT public_documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);


-- public.embeddings definition

-- Drop table

-- DROP TABLE public.embeddings;

CREATE TABLE public.embeddings (
                                   id bigserial NOT NULL,
                                   "token" int8 NULL,
                                   "content" text NULL,
                                   metadata jsonb NULL,
                                   embedding public.vector NULL,
                                   document_id uuid NULL,
                                   CONSTRAINT embeddings_pkey PRIMARY KEY (id),
                                   CONSTRAINT embeddings_fk FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX embeddings_document_id_idx ON public.embeddings USING btree (document_id);


-- public.flashcards_sets definition

-- Drop table

-- DROP TABLE public.flashcards_sets;

CREATE TABLE public.flashcards_sets (
                                        created_at timestamptz DEFAULT now() NOT NULL,
                                        topic text NOT NULL,
                                        document_id uuid NOT NULL,
                                        id int8 DEFAULT nextval('flashcard_sets_id_seq'::regclass) NOT NULL,
                                        reviewed_at timestamptz NULL,
                                        CONSTRAINT flashcard_sets_pk PRIMARY KEY (id),
                                        CONSTRAINT flashcard_sets_fk FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE ON UPDATE CASCADE
);


-- public.generated_videos definition

-- Drop table

-- DROP TABLE public.generated_videos;

CREATE TABLE public.generated_videos (
                                         "uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
                                         document_id uuid NOT NULL,
                                         "name" text NOT NULL,
                                         user_query text NOT NULL,
                                         generated_prompt text NULL,
                                         link text NOT NULL,
                                         vtt_link text NULL,
                                         srt_link text NULL,
                                         created_at timestamptz DEFAULT now() NOT NULL,
                                         error_message text NULL,
                                         generation_time_sec numeric NULL,
                                         CONSTRAINT generated_videos_pkey PRIMARY KEY (uuid),
                                         CONSTRAINT generated_videos_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE
);


-- public.notes definition

-- Drop table

-- DROP TABLE public.notes;

CREATE TABLE public.notes (
                              id uuid DEFAULT gen_random_uuid() NOT NULL,
                              created_at timestamptz DEFAULT now() NOT NULL,
                              updated_at timestamptz DEFAULT now() NOT NULL,
                              document_id uuid NULL,
                              user_id uuid NOT NULL,
                              title text NOT NULL,
                              "content" text NOT NULL,
                              container_id uuid NOT NULL,
                              CONSTRAINT notes_pkey PRIMARY KEY (id),
                              CONSTRAINT notes_container_id_fkey FOREIGN KEY (container_id) REFERENCES public.containers(id) ON DELETE CASCADE ON UPDATE CASCADE,
                              CONSTRAINT "public_notes_documentId_fkey" FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE,
                              CONSTRAINT "public_notes_userId_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);


-- public.quizzes definition

-- Drop table

-- DROP TABLE public.quizzes;

CREATE TABLE public.quizzes (
                                id int8 DEFAULT nextval('quizes_id_seq'::regclass) NOT NULL,
                                created_at timestamptz DEFAULT now() NOT NULL,
                                query varchar NOT NULL,
                                document_id uuid NOT NULL,
                                CONSTRAINT quizes_pk PRIMARY KEY (id),
                                CONSTRAINT quizes_fk FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE ON UPDATE CASCADE
);


-- public.recording_chunks definition

-- Drop table

-- DROP TABLE public.recording_chunks;

CREATE TABLE public.recording_chunks (
                                         id bigserial NOT NULL,
                                         recording_id uuid NOT NULL,
                                         "start" float8 NOT NULL,
                                         "end" float8 NOT NULL,
                                         "text" varchar NULL,
                                         "index" int8 DEFAULT 0 NOT NULL,
                                         url varchar NULL,
                                         CONSTRAINT recording_chunks_pk PRIMARY KEY (id),
                                         CONSTRAINT recording_chunks_fk FOREIGN KEY (recording_id) REFERENCES public.recordings(id) ON DELETE CASCADE ON UPDATE CASCADE
);


-- public.chats definition

-- Drop table

-- DROP TABLE public.chats;

CREATE TABLE public.chats (
                              id uuid DEFAULT gen_random_uuid() NOT NULL,
                              user_id uuid NOT NULL,
                              document_id uuid NOT NULL,
                              created_at timestamptz DEFAULT now() NOT NULL,
                              title varchar NOT NULL,
                              "type" varchar DEFAULT 'chat'::character varying NOT NULL,
                              "source" jsonb NULL,
                              CONSTRAINT chats_pk PRIMARY KEY (id),
                              CONSTRAINT chats_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
                              CONSTRAINT chats_fk_1 FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE ON UPDATE CASCADE
);


-- public.flashcards definition

-- Drop table

-- DROP TABLE public.flashcards;

CREATE TABLE public.flashcards (
                                   created_at timestamptz DEFAULT now() NOT NULL,
                                   question text NOT NULL,
                                   answer text NOT NULL,
                                   id bigserial NOT NULL,
                                   flashcards_set_id int8 NOT NULL,
                                   page_number int4 NOT NULL,
                                   CONSTRAINT flashcards_pk PRIMARY KEY (id),
                                   CONSTRAINT flashcards_fk FOREIGN KEY (flashcards_set_id) REFERENCES public.flashcards_sets(id) ON DELETE CASCADE ON UPDATE CASCADE
);


-- public.quiz_answers definition

-- Drop table

-- DROP TABLE public.quiz_answers;

CREATE TABLE public.quiz_answers (
                                     id bigserial NOT NULL,
                                     quiz_id int8 NOT NULL,
                                     answers jsonb NOT NULL,
                                     passed_questions_count int4 NOT NULL,
                                     time_seconds int4 NOT NULL,
                                     created_at timestamptz DEFAULT now() NOT NULL,
                                     user_id uuid NOT NULL,
                                     total_questions_count int4 NOT NULL,
                                     CONSTRAINT quiz_answers_pk PRIMARY KEY (id),
                                     CONSTRAINT quiz_answers_fk FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE ON UPDATE CASCADE,
                                     CONSTRAINT quiz_answers_profiles_fk FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE ON UPDATE CASCADE
);


-- public.quiz_questions definition

-- Drop table

-- DROP TABLE public.quiz_questions;

CREATE TABLE public.quiz_questions (
                                       id bigserial NOT NULL,
                                       quiz_id int8 NOT NULL,
                                       question varchar NOT NULL,
                                       question_type varchar NOT NULL,
                                       "options" jsonb NOT NULL,
                                       page_number int4 NOT NULL,
                                       explanation varchar NOT NULL,
                                       difficulty_level varchar NOT NULL,
                                       correct_answer varchar NOT NULL,
                                       citation varchar NULL,
                                       CONSTRAINT quiz_questions_pk PRIMARY KEY (id),
                                       CONSTRAINT quiz_questions_fk FOREIGN KEY (quiz_id) REFERENCES public.quizzes(id) ON DELETE CASCADE ON UPDATE CASCADE
);


-- public.chat_messages definition

-- Drop table

-- DROP TABLE public.chat_messages;

CREATE TABLE public.chat_messages (
                                      id bigserial NOT NULL,
                                      created_at timestamptz DEFAULT now() NOT NULL,
                                      chat_id uuid NOT NULL,
                                      question varchar NOT NULL,
                                      response varchar NOT NULL,
                                      "source" jsonb NULL,
                                      CONSTRAINT chat_messages_pk PRIMARY KEY (id),
                                      CONSTRAINT chat_messages_fk FOREIGN KEY (chat_id) REFERENCES public.chats(id) ON DELETE CASCADE ON UPDATE CASCADE
);
