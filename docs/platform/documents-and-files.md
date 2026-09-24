# V4 Documents And Files

This guide explains how an app should handle uploaded files, documents, and AI
workflows on the PublicAPI v4 surface.

## Choose The Right Model

| User goal | Use this model | App API | CLI |
| --- | --- | --- | --- |
| Upload a document so the platform can process, classify, or index it for AI | Document workflow | `useDocuments().upload`, `classify`, `ragIndex` | `eai docs upload`, `eai docs classify`, `eai docs index` |
| Attach a file to an existing business record | Resource file property | `useResources(type).uploadFile` | `eai resources file upload` |
| Store an arbitrary blob without a document or resource owner | Do not use as a public v4 app pattern | No public app-template helper | No named command |

V4 does not treat file upload as a free-form blob write. A file belongs to one
of two public app concepts:

- a document workflow when the file itself is the thing to process, classify, or
  make available to AI;
- a ResourceAPI file property when the file is an attachment on an existing
  typed resource.

## Document Workflow

Use document workflow routes when the user thinks of the file as a document:
contracts, policies, evidence packs, supporting documents, reports, PDFs, Word
files, and knowledge sources.

Step goals:

1. Upload the file with tenant context.
2. Capture the returned job or document ID.
3. Classify the document when the app needs a document type or extraction path.
4. Index the document for RAG when chat or workflow stages need to answer from
   the content.
5. Pass the document ID, business object ID, or workflow context to the AI
   workflow instead of giving the browser direct blob access.

App code:

```tsx
const { upload, classify, ragIndex, getJobStatus } = useDocuments(tenantId);

const uploadResponse = await upload(file, {
  category: "supporting-document",
  application_id: applicationId,
});
const uploadPayload = await uploadResponse.json();
const documentId =
  uploadPayload.documentId ||
  uploadPayload.documents?.[0]?.documentId ||
  uploadPayload.documents?.[0]?.document_id;

await classify([file]);
await ragIndex({
  documentId,
  businessRequestId: applicationId,
  documentScope: "br",
});

if (uploadPayload.jobId) {
  await getJobStatus(uploadPayload.jobId);
}
```

CLI equivalent:

```bash
eai docs upload ./supporting-document.pdf
eai docs classify ./supporting-document.pdf
eai docs index <document-id>
```

The PublicAPI route behind this workflow is:

```text
POST /v4/data/documents/upload
```

Use `eai publicapi get /v4/data/documents/jobs/<job-id>` for job status until a
named CLI job command exists.

## Resource File Property Workflow

Use resource file properties when the file is an attachment to business data:
inspection photos on an inspection record, signed PDFs on a contract record,
CSV evidence on an audit record, or files that should follow a resource's
permissions and lifecycle.

Step goals:

1. Define an Object Type with a `file` property.
2. Seed the Object Type.
3. Create or find the resource row.
4. Upload the file to that resource's file property.
5. Read, delete, or request a short-lived read URL through the same resource
   route when the user has access.

App code:

```tsx
const resources = useResources("ApplicationDocument", tenantId);

const document = await resources.create({
  title: file.name,
  applicationId,
  status: "uploaded",
});

await resources.uploadFile(document.id, "file", file, {
  filename: file.name,
  contentType: file.type || "application/octet-stream",
});

const fileStatus = await resources.getFileIndexStatus(document.id, "file");
```

CLI equivalent:

```bash
eai resources create ApplicationDocument \
  --tenant-id <tenant-id> \
  --data '{"title":"supporting-document.pdf","applicationId":"app-123"}'

eai resources file upload ApplicationDocument <resource-id> file ./supporting-document.pdf \
  --tenant-id <tenant-id>
```

The PublicAPI route behind this workflow is:

```text
POST /v4/data/resources/{tenantId}/{objectType}/{resourceId}/files/{propertyName}
```

## AI Workflow Access To Documents

AI workflows should not fetch raw blob storage directly from browser code. The
app should give the workflow stable platform context:

- `tenantId`
- `workflowId`
- `stage`
- `documentId` or `documentIds`
- related resource IDs such as `applicationId`, `caseId`, or `businessRequestId`
- user intent in the `message`
- structured values in `params` or `runtime_context`

Example:

```tsx
await client.chat.send({
  workflowId: "application-advisor",
  stage: "review",
  message: "Summarise the uploaded supporting documents and list missing evidence.",
  conversationId,
  params: {
    applicationId,
    documentIds: [documentId],
  },
  runtime_context: {
    applicationId,
    documentIds: [documentId],
  },
});
```

The workflow then uses the platform document/RAG context that has already been
indexed or attached to the resource. The prompt should ask for an outcome, not
for a storage URL.

## Prompt Templates For AI Agents

When an AI agent is building an app feature, it should ask the user these
questions before choosing an API:

```text
1. Is the uploaded file a document to process with AI, or an attachment to a business record?
2. Should AI answer from the file content, classify it, or just keep it as evidence?
3. Which tenant, workflow, and workflow stage should use the document?
4. If this is an attachment, which Object Type, resource ID, and file property owns it?
5. What should happen when the user deletes the resource or document?
```

When the file is a document:

```text
Use the EAI document workflow. Add upload, optional classify, optional RAG index,
and pass document IDs into the chat/workflow runtime context. Do not create a
standalone blob upload path.
```

When the file is a resource attachment:

```text
Use a ResourceAPI file property. Ensure the Object Type has a file property,
create or locate the resource, upload through the resource file route, and rely
on resource permissions for access.
```

When the request asks for standalone blob storage:

```text
There is no public v4 app-template pattern for arbitrary blob writes. Ask
whether this should be a document workflow or a resource file property, then
implement that public v4 model.
```

## Verification

Use these checks while developing:

```bash
eai whoami
eai resources schema --tenant-id <tenant-id> --format json
eai docs upload ./sample.pdf
eai docs index <document-id>
eai resources file upload <ObjectType> <resource-id> <property> ./sample.pdf --tenant-id <tenant-id>
```

Use named commands first. Use `eai publicapi <method> /v4/...` only when an
authorized v4 route has no named SDK or CLI command yet.
